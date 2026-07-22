import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js'
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js'
import { STLLoader } from 'three/addons/loaders/STLLoader.js'

interface Props {
  url: string   // blob: yoki http: URL
  name: string
  onClose: () => void
  onDownload: () => void
}

export default function Model3DViewer({ url, name, onClose, onDownload }: Props) {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  const canvasRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  useEffect(() => {
    if (!canvasRef.current) return
    const container = canvasRef.current
    let animId = 0
    let cleanup = () => {}

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0f172a)

    const grid = new THREE.GridHelper(200, 40, 0x334155, 0x1e293b)
    scene.add(grid)

    const w = container.clientWidth
    const h = container.clientHeight
    const camera = new THREE.PerspectiveCamera(45, w / h, 0.01, 10000)
    camera.position.set(0, 80, 200)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' })
    renderer.setSize(w, h)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
    renderer.shadowMap.enabled = false
    container.appendChild(renderer.domElement)

    const ambient = new THREE.AmbientLight(0xffffff, 0.8)
    scene.add(ambient)
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0)
    dirLight.position.set(100, 200, 100)
    scene.add(dirLight)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.06

    const addGeometry = (geometry: THREE.BufferGeometry) => {
      geometry.computeVertexNormals()
      geometry.computeBoundingBox()
      const box = geometry.boundingBox
      if (!box) throw new Error('empty_geometry')

      const center = new THREE.Vector3()
      box.getCenter(center)
      geometry.translate(-center.x, -center.y, -center.z)

      const size = new THREE.Vector3()
      box.getSize(size)
      const maxDim = Math.max(size.x, size.y, size.z) || 1
      const scale = 100 / maxDim

      const mat = new THREE.MeshStandardMaterial({
        color: 0x94a3b8,
        metalness: 0.2,
        roughness: 0.62,
        side: THREE.DoubleSide,
      })
      const mesh = new THREE.Mesh(geometry, mat)
      mesh.scale.setScalar(scale)
      scene.add(mesh)

      camera.position.set(0, maxDim * scale * 0.6, maxDim * scale * 1.45)
      controls.target.set(0, 0, 0)
      controls.update()
      setLoading(false)
    }

    const loadModel = () => {
      try {
        if (ext === 'stl') {
          new STLLoader().load(
            url,
            (geo) => addGeometry(geo),
            undefined,
            () => { setError('STL faylni o\'qib bo\'lmadi'); setLoading(false) },
          )
        } else if (ext === 'obj') {
          new OBJLoader().load(
            url,
            (obj) => {
              obj.traverse((child: any) => {
                if (child.isMesh) {
                  child.material = new THREE.MeshStandardMaterial({
                    color: 0x94a3b8,
                    metalness: 0.2,
                    roughness: 0.62,
                    side: THREE.DoubleSide,
                  })
                }
              })
              const box = new THREE.Box3().setFromObject(obj)
              const size = new THREE.Vector3()
              box.getSize(size)
              const maxDim = Math.max(size.x, size.y, size.z) || 1
              const scale = 100 / maxDim
              const center = new THREE.Vector3()
              box.getCenter(center)
              obj.position.sub(center)
              obj.scale.setScalar(scale)
              scene.add(obj)
              camera.position.set(0, 60, 150)
              controls.target.set(0, 0, 0)
              controls.update()
              setLoading(false)
            },
            undefined,
            () => { setError('OBJ faylni o\'qib bo\'lmadi'); setLoading(false) },
          )
        } else if (ext === 'ply') {
          new PLYLoader().load(
            url,
            (geo) => addGeometry(geo),
            undefined,
            () => { setError('PLY faylni o\'qib bo\'lmadi'); setLoading(false) },
          )
        } else {
          setError('Qo\'llab-quvvatlanmaydigan format')
          setLoading(false)
        }
      } catch {
        setError('3D model yuklab bo\'lmadi')
        setLoading(false)
      }
    }

    const rafId = window.requestAnimationFrame(loadModel)

    function onResize() {
      const w2 = container.clientWidth
      const h2 = container.clientHeight
      camera.aspect = w2 / h2
      camera.updateProjectionMatrix()
      renderer.setSize(w2, h2)
    }
    window.addEventListener('resize', onResize)

    let running = true
    function animate() {
      if (!running) return
      animId = requestAnimationFrame(animate)
      controls.update()
      renderer.render(scene, camera)
    }
    animate()

    cleanup = () => {
      running = false
      cancelAnimationFrame(animId)
      cancelAnimationFrame(rafId)
      window.removeEventListener('resize', onResize)
      controls.dispose()
      renderer.dispose()
      try {
        renderer.domElement.remove()
      } catch {
        // React/unmount cleanup order can detach the node first; ignore that race.
      }
    }

    return () => cleanup()
  }, [url, name, ext])

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-[#0f172a]"
      style={{ fontFamily: 'system-ui, sans-serif' }}
    >
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-[#1e293b] px-4 py-3">
        <span className="rounded bg-[#1e3a5f] px-2 py-0.5 text-[10px] font-bold text-[#7dd3fc]">
          {ext.toUpperCase()}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-200">{name}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">
            Mouse: aylandirish · Scroll: zoom · Sichqoncha o'ng: siljitish
          </span>
          <button
            onClick={onDownload}
            className="rounded-md bg-[#1e293b] px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-[#334155] transition-colors"
          >
            ⬇ Yuklab olish
          </button>
          <button
            onClick={onClose}
            className="rounded-md bg-[#1e293b] px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-rose-900/40 hover:text-rose-400 transition-colors"
          >
            ✕ Yopish
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div className="relative flex-1 overflow-hidden" ref={canvasRef}>
        {loading && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-400">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#334155] border-t-[#7dd3fc]" />
            <span className="text-sm">3D model yuklanmoqda…</span>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <span className="text-4xl">⚠️</span>
            <p className="text-sm text-rose-400">{error}</p>
            <button onClick={onDownload} className="mt-2 rounded-md bg-[#1e293b] px-4 py-2 text-xs text-slate-300 hover:bg-[#334155]">
              Yuklab olish
            </button>
          </div>
        )}
      </div>

      {/* Footer hint */}
      <div className="shrink-0 border-t border-[#1e293b] px-4 py-2 text-center text-[10px] text-slate-600">
        STL · OBJ · PLY — Texnik stomatologiya 3D modellari
      </div>
    </div>
  )
}
