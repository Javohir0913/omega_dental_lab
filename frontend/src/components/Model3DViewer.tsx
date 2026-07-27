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

// Yorug'lik manbalarining boshlang'ich (100%) intensivligi — slider shu qiymatlarni ko'paytiradi
const BASE_LIGHT = { hemi: 1.1, ambient: 0.55, head: 1.1, fill: 0.35 }

// Kameraning ko'rish burchagi (Field of View) — daraja hisobida.
// Kamera JOYIDAN qimirlamaydi — faqat camera.fov o'zgaradi (linza fokus masofasi kabi).
//   FOV = 1°  → telephoto: burchak juda tor, ob'ekt juda yaqin/zoomed-in, perspektiva tekis.
//   FOV = 90° → wide-angle: burchak keng, atrof panorama bo'lib ochiladi (zoomed-out).
// Kichik FOV'da orqa tishlar (18·28·38·48) old tishlar (6·7) ortidan tekis ko'rinadi.
const DEFAULT_FOV = 45
const MIN_FOV = 1
const MAX_FOV = 90

export default function Model3DViewer({ url, name, onClose, onDownload }: Props) {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  const canvasRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lightMult, setLightMult] = useState(1)
  const [fov, setFov] = useState(DEFAULT_FOV)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  // Oxirgi FOV — exocad kabi masofa kompensatsiyasini bosqichma-bosqich hisoblash uchun
  const prevFovRef = useRef(DEFAULT_FOV)
  const lightsRef = useRef<{
    hemi: THREE.HemisphereLight
    ambient: THREE.AmbientLight
    head: THREE.DirectionalLight
    fill: THREE.DirectionalLight
  } | null>(null)

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

    // Yangi model yuklanganda holatni tiklaymiz (spinner ko'rinadi, FOV effekti qayta ishga tushadi)
    setLoading(true)
    setError(null)

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0f172a)

    const w = container.clientWidth
    const h = container.clientHeight
    const camera = new THREE.PerspectiveCamera(DEFAULT_FOV, w / h, 0.01, 1_000_000)
    camera.position.set(0, 80, 200)
    cameraRef.current = camera
    prevFovRef.current = DEFAULT_FOV

    // logarithmicDepthBuffer — kichik FOV'da (1°–5°) kamera juda uzoqda bo'lganda ham
    // chuqurlik aniqligini saqlaydi, ya'ni sirtlar bir-biriga urishmaydi (z-fighting yo'q).
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance', logarithmicDepthBuffer: true })
    renderer.setSize(w, h)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 3))
    renderer.shadowMap.enabled = false
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    container.appendChild(renderer.domElement)

    // Yumshoq, hamma tomondan bir xil yoritish — soyalar qattiq qorong'i bo'lib qolmasligi uchun
    const hemi = new THREE.HemisphereLight(0xffffff, 0x606870, BASE_LIGHT.hemi)
    scene.add(hemi)
    const ambient = new THREE.AmbientLight(0xffffff, BASE_LIGHT.ambient)
    scene.add(ambient)
    // "Fonar" — doim kamera tomonidan yoritadi, shuning uchun modelni har qanday burchakdan
    // aylantirganda ham qorong'i tomon qolmaydi
    const headLight = new THREE.DirectionalLight(0xffffff, BASE_LIGHT.head)
    scene.add(headLight)
    // Qarama-qarshi tomondan yumshoq to'ldiruvchi yorug'lik — tekis "kartondek" ko'rinmasligi uchun
    const fillLight = new THREE.DirectionalLight(0xffffff, BASE_LIGHT.fill)
    fillLight.position.set(-100, 50, -150)
    scene.add(fillLight)

    lightsRef.current = { hemi, ambient, head: headLight, fill: fillLight }

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.06
    controlsRef.current = controls

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

      // Ba'zi PLY fayllarda skanerdan olingan asl rang (har bir nuqta uchun) bo'ladi —
      // bo'lsa o'shani ko'rsatamiz, bo'lmasa neytral kulrang material.
      const hasVertexColors = !!geometry.attributes.color
      const mat = new THREE.MeshStandardMaterial({
        color: hasVertexColors ? 0xffffff : 0x94a3b8,
        vertexColors: hasVertexColors,
        metalness: 0.15,
        roughness: 0.55,
        side: THREE.DoubleSide,
      })
      const mesh = new THREE.Mesh(geometry, mat)
      mesh.scale.setScalar(scale)
      scene.add(mesh)

      camera.position.set(0, maxDim * scale * 0.6, maxDim * scale * 1.45)
      controls.target.set(0, 0, 0)
      controls.update()
      // Kamera DEFAULT_FOV bo'yicha kadrga solindi — kompensatsiya shu nuqtadan boshlanadi
      camera.fov = DEFAULT_FOV
      camera.updateProjectionMatrix()
      prevFovRef.current = DEFAULT_FOV
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
                  child.geometry?.computeVertexNormals?.()
                  const hasVertexColors = !!child.geometry?.attributes?.color
                  child.material = new THREE.MeshStandardMaterial({
                    color: hasVertexColors ? 0xffffff : 0x94a3b8,
                    vertexColors: hasVertexColors,
                    metalness: 0.15,
                    roughness: 0.55,
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
              // Kamera DEFAULT_FOV bo'yicha kadrga solindi — kompensatsiya shu nuqtadan boshlanadi
              camera.fov = DEFAULT_FOV
              camera.updateProjectionMatrix()
              prevFovRef.current = DEFAULT_FOV
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
      // Fonar doim kamera qayerda bo'lsa o'sha yerdan yoritadi — model qanday burilsa ham qorong'i qolmaydi
      headLight.position.copy(camera.position)
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
      lightsRef.current = null
      cameraRef.current = null
      controlsRef.current = null
      try {
        renderer.domElement.remove()
      } catch {
        // React/unmount cleanup order can detach the node first; ignore that race.
      }
    }

    return () => cleanup()
  }, [url, name, ext])

  // Yorug'lik slaydери — modelni qayta yuklamasdan, faqat intensivlikni jonli o'zgartiradi
  useEffect(() => {
    const l = lightsRef.current
    if (!l) return
    l.hemi.intensity = BASE_LIGHT.hemi * lightMult
    l.ambient.intensity = BASE_LIGHT.ambient * lightMult
    l.head.intensity = BASE_LIGHT.head * lightMult
    l.fill.intensity = BASE_LIGHT.fill * lightMult
  }, [lightMult, loading])

  // FOV slaydери — exocad uslubida: FOV o'zgarganda kamerani model o'lchami ekranда
  // o'zgarmaydigan qilib masofasini ham moslaydi (masofa ∝ 1/tan(fov/2)).
  // Shunda faqat PERSPEKTIVA o'zgaradi (orqa tishlar ochiladi), model "zoom" bo'lib
  // kattalashib/kichrayib ketmaydi. Bosqichma-bosqich (prevFov→fov) hisoblanadi,
  // shuning uchun foydalanuvchi qo'lda kattalashtirgani (scroll) ham saqlanadi.
  useEffect(() => {
    const cam = cameraRef.current
    if (!cam) return
    const prev = prevFovRef.current
    const target = controlsRef.current?.target ?? new THREE.Vector3(0, 0, 0)
    // Model o'lchamini saqlash uchun masofani tan(prev/2)/tan(fov/2) nisbatida kattalashtiramiz
    const scale =
      Math.tan(THREE.MathUtils.degToRad(prev / 2)) /
      Math.tan(THREE.MathUtils.degToRad(fov / 2))
    const offset = cam.position.clone().sub(target).multiplyScalar(scale)
    cam.position.copy(target).add(offset)
    cam.fov = fov
    cam.updateProjectionMatrix()
    controlsRef.current?.update()
    prevFovRef.current = fov
  }, [fov, loading])

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

        {!loading && !error && (
          <div className="absolute bottom-3 right-3 flex flex-col gap-2 rounded-lg border border-[#1e293b] bg-[#0f172a]/90 px-3 py-2 backdrop-blur-sm">
            <div className="flex items-center gap-2">
              <span className="text-sm" title="Yorug'lik">☀️</span>
              <input
                type="range"
                min={0.4}
                max={2.2}
                step={0.1}
                value={lightMult}
                onChange={(e) => setLightMult(Number(e.target.value))}
                className="w-28 accent-[#7dd3fc]"
              />
              <span className="w-9 text-right text-[10px] tabular-nums text-slate-500">
                {Math.round(lightMult * 100)}%
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setFov(DEFAULT_FOV)}
                title="FOV (ko'rish burchagi) — kichraytirsangiz orqa tishlar (18·28·38·48) old tishlar ortidan chiqadi. Bosib standartga qaytaring"
                className="text-sm hover:opacity-80"
              >
                🔍
              </button>
              <input
                type="range"
                min={MIN_FOV}
                max={MAX_FOV}
                step={1}
                value={fov}
                onChange={(e) => setFov(Number(e.target.value))}
                className="w-28 accent-[#7dd3fc]"
              />
              <span className="w-9 text-right text-[10px] tabular-nums text-slate-500">
                {fov}°
              </span>
            </div>
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
