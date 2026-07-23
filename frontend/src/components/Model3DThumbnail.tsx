import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js'
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js'
import { STLLoader } from 'three/addons/loaders/STLLoader.js'
import { API_URL, tokens } from '@/lib/api'

interface Props {
  url: string   // API relative url (masalan f.url)
  name: string
  className?: string
}

const SNAPSHOT_SIZE = 320

// STL/OBJ/PLY faylni bir marta render qilib, natijani statik rasm (dataURL) sifatida qaytaradi.
// Shu tufayli fayl kartochkasi ochilmasdan turib ham modelning haqiqiy ko'rinishi ko'rsatiladi,
// va bir vaqtda ko'plab kartalar bo'lsa ham WebGL kontekstlar ochiq qolib ketmaydi.
function renderSnapshot(ext: string, objectUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 10000)
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
    renderer.setSize(SNAPSHOT_SIZE, SNAPSHOT_SIZE)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace

    scene.add(new THREE.HemisphereLight(0xffffff, 0x606870, 1.1))
    scene.add(new THREE.AmbientLight(0xffffff, 0.55))
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.1)
    keyLight.position.set(100, 200, 150)
    scene.add(keyLight)
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.5)
    fillLight.position.set(-120, 80, -100)
    scene.add(fillLight)

    const plainMaterial = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      metalness: 0.15,
      roughness: 0.55,
      side: THREE.DoubleSide,
    })
    const vertexColorMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      metalness: 0.15,
      roughness: 0.55,
      side: THREE.DoubleSide,
    })

    const finish = (object: THREE.Object3D, maxDim: number, scale: number) => {
      scene.add(object)
      const dist = Math.max(maxDim * scale, 1)
      camera.position.set(dist * 0.9, dist * 0.75, dist * 0.9)
      camera.lookAt(0, 0, 0)
      renderer.render(scene, camera)
      const dataUrl = renderer.domElement.toDataURL('image/png')
      renderer.dispose()
      plainMaterial.dispose()
      vertexColorMaterial.dispose()
      resolve(dataUrl)
    }

    const fail = () => {
      renderer.dispose()
      plainMaterial.dispose()
      vertexColorMaterial.dispose()
      reject(new Error('render_failed'))
    }

    const frameGeometry = (geo: THREE.BufferGeometry) => {
      geo.computeVertexNormals()
      geo.computeBoundingBox()
      const box = geo.boundingBox
      if (!box) throw new Error('empty_geometry')
      const center = new THREE.Vector3()
      box.getCenter(center)
      geo.translate(-center.x, -center.y, -center.z)
      const size = new THREE.Vector3()
      box.getSize(size)
      const maxDim = Math.max(size.x, size.y, size.z) || 1
      const scale = 100 / maxDim
      const mesh = new THREE.Mesh(geo, geo.attributes.color ? vertexColorMaterial : plainMaterial)
      mesh.scale.setScalar(scale)
      finish(mesh, maxDim, scale)
    }

    if (ext === 'stl') {
      new STLLoader().load(objectUrl, frameGeometry, undefined, fail)
    } else if (ext === 'ply') {
      new PLYLoader().load(objectUrl, frameGeometry, undefined, fail)
    } else if (ext === 'obj') {
      new OBJLoader().load(
        objectUrl,
        (obj) => {
          obj.traverse((child: any) => {
            if (child.isMesh) {
              child.geometry?.computeVertexNormals?.()
              child.material = child.geometry?.attributes?.color ? vertexColorMaterial : plainMaterial
            }
          })
          const box = new THREE.Box3().setFromObject(obj)
          const size = new THREE.Vector3()
          box.getSize(size)
          const center = new THREE.Vector3()
          box.getCenter(center)
          const maxDim = Math.max(size.x, size.y, size.z) || 1
          const scale = 100 / maxDim
          obj.position.set(-center.x * scale, -center.y * scale, -center.z * scale)
          obj.scale.setScalar(scale)
          finish(obj, maxDim, scale)
        },
        undefined,
        fail,
      )
    } else {
      fail()
    }
  })
}

export default function Model3DThumbnail({ url, name, className }: Props) {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  const containerRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [thumbSrc, setThumbSrc] = useState<string | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisible(true)
          io.disconnect()
        }
      },
      { rootMargin: '200px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    if (!visible) return
    let cancelled = false
    let objectUrl: string | null = null
    setStatus('loading')

    ;(async () => {
      try {
        const r = await fetch(`${API_URL}${url}`, {
          headers: { Authorization: `Bearer ${tokens.access ?? ''}` },
        })
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const blob = await r.blob()
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        const dataUrl = await renderSnapshot(ext, objectUrl)
        if (cancelled) return
        setThumbSrc(dataUrl)
        setStatus('done')
      } catch {
        if (!cancelled) setStatus('error')
      } finally {
        if (objectUrl) URL.revokeObjectURL(objectUrl)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [visible, url, ext])

  return (
    <div ref={containerRef} className={className ?? 'relative h-full w-full'}>
      {status === 'done' && thumbSrc ? (
        <img src={thumbSrc} alt={name} className="h-full w-full object-contain" />
      ) : status === 'error' ? (
        <div className="flex h-full w-full items-center justify-center">
          <span className="text-5xl drop-shadow-lg">🦷</span>
        </div>
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#334155] border-t-[#7dd3fc]" />
        </div>
      )}
    </div>
  )
}
