import clsx from 'clsx'

// FDI (xalqaro) tartibida: har qatorda o'ng yarim, keyin chap yarim (o'rtada jag' chizig'i)
export const UPPER_RIGHT = [18, 17, 16, 15, 14, 13, 12, 11]
export const UPPER_LEFT = [21, 22, 23, 24, 25, 26, 27, 28]
export const LOWER_RIGHT = [48, 47, 46, 45, 44, 43, 42, 41]
export const LOWER_LEFT = [31, 32, 33, 34, 35, 36, 37, 38]

const UPPER_ORDER = [...UPPER_RIGHT, ...UPPER_LEFT]
const LOWER_ORDER = [...LOWER_RIGHT, ...LOWER_LEFT]

// Har bir tish turi FDI kodining oxirgi raqami bilan aniqlanadi (kvadrantdan qat'i nazar bir xil):
// 1-2 kurak tish (incisor), 3 qoziq tish (canine), 4-5 kichik oziq tish (premolar), 6-8 katta oziq tish (molar)
type ToothKind = 'incisor' | 'canine' | 'premolar' | 'molar'

function toothKind(code: number): ToothKind {
  const pos = code % 10
  if (pos <= 2) return 'incisor'
  if (pos === 3) return 'canine'
  if (pos <= 5) return 'premolar'
  return 'molar'
}

const SCALE = 1.3
// Har bir tish shaklining haqiqiy (scale qo'llangandan keyingi) kengligi — qadam hajmini shunga mos hisoblash uchun
const SLOT_WIDTH: Record<ToothKind, number> = {
  incisor: 8 * SCALE,
  canine: 9 * SCALE,
  premolar: 12 * SCALE,
  molar: 16 * SCALE,
}
// 1-5 (kurak/qoziq/kichik oziq) orasi, 6-7-8 (katta oziq) orasidan kamroq bo'shliq
const GAP_FRONT = 3.5
const GAP_BACK = 7

const ARCH_CY_UPPER = 90
const ARCH_CY_LOWER = 130
const ARCH_RY = 74

/**
 * Har bir tishga X ni kenglik+bo'shliqqa qarab ketma-ket (hech qachon ustma-ust tushmaydigan)
 * qo'yadi, so'ng Y ni HAQIQIY ellips tenglamasidan olinadi (y = cy ± RY*sqrt(1-(x/a)^2)) —
 * shu sababli natija har doim aniq oval (jag') shaklida bo'ladi, X esa xavfsiz nazorat qilinadi.
 */
function ellipseRow(order: number[], cy: number, curveSign: 1 | -1) {
  const kinds = order.map(toothKind)
  const widths = kinds.map((k) => SLOT_WIDTH[k])
  const n = order.length

  let cursor = 0
  const centers: number[] = []
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      const back = kinds[i - 1] === 'molar' || kinds[i] === 'molar'
      cursor += back ? GAP_BACK : GAP_FRONT
    }
    centers.push(cursor + widths[i] / 2)
    cursor += widths[i]
  }
  const total = cursor
  const halfWidth = total / 2

  return {
    total,
    positions: order.map((code, i) => {
      const xOffset = centers[i] - halfWidth
      const ratio = Math.max(-1, Math.min(1, xOffset / halfWidth))
      const y = cy + curveSign * ARCH_RY * Math.sqrt(1 - ratio * ratio)
      return { code, x: xOffset, y }
    }),
  }
}

const upperRow = ellipseRow(UPPER_ORDER, ARCH_CY_UPPER, -1)
const lowerRow = ellipseRow(LOWER_ORDER, ARCH_CY_LOWER, 1)

const CHART_WIDTH = Math.max(upperRow.total, lowerRow.total)
const MARGIN_X = 26
const MARGIN_TOP = 22
const MARGIN_BOTTOM = 34
const VIEW_W = CHART_WIDTH + MARGIN_X * 2
const VIEW_MIN_Y = -MARGIN_TOP
const VIEW_H = ARCH_CY_LOWER + ARCH_RY + MARGIN_BOTTOM + MARGIN_TOP
const X_CENTER = VIEW_W / 2

const UPPER_POS = upperRow.positions.map((p) => ({ ...p, x: p.x + X_CENTER }))
const LOWER_POS = lowerRow.positions.map((p) => ({ ...p, x: p.x + X_CENTER }))

// Har biri: tож (yuqorida, bo'yniqisqa toraygan) + ildiz (pastda) — haqiqiy tish siluetiga o'xshab
const TOOTH_PATHS: Record<ToothKind, string> = {
  // Kurak tish — tor, tekis kesuvchi qirra
  incisor:
    'M6,2 Q6,1 7,1 L13,1 Q14,1 14,2 L14,13 Q13.5,14.5 12.5,16 L11.5,25 Q10,26 8.5,25 L7.5,16 Q6.5,14.5 6,13 Z',
  // Qoziq tish — bitta uchli cho'qqi
  canine:
    'M10,1 L13.5,6 Q14.5,9.5 14,13 Q13.5,14.5 12.5,16 L11.5,25 Q10,26 8.5,25 L7.5,16 Q6.5,14.5 6,13 Q5.5,9.5 6.5,6 Z',
  // Kichik oziq tish — o'rtacha kenglikda, dumaloq tож
  premolar:
    'M4,7 Q4,1 10,1 Q16,1 16,7 L16,13 Q15.5,14.5 14.5,16 L12.5,25 Q10,26.5 7.5,25 L5.5,16 Q4.5,14.5 4,13 Z',
  // Katta oziq tish — eng keng, ikki cho'qqili chaynov yuzasi
  molar:
    'M2,9 Q2,1 6,1.5 Q8,3.5 10,1.5 Q12,3.5 14,1.5 Q18,1 18,9 L18,13 Q17,15 15,16.5 L14,25 Q10,27 6,25 L5,16.5 Q3,15 2,13 Z',
}

const LOCAL_CX = 10
const LOCAL_CY = 13

function ToothShape({ kind, className }: { kind: ToothKind; className: string }) {
  return <path d={TOOTH_PATHS[kind]} strokeWidth={1} strokeLinejoin="round" className={className} />
}

function Tooth({
  x,
  y,
  code,
  label,
  selected,
  onClick,
}: {
  x: number
  y: number
  code: number
  label: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <g
      transform={`translate(${x - SCALE * LOCAL_CX}, ${y - SCALE * LOCAL_CY}) scale(${SCALE})`}
      onClick={onClick}
      className="cursor-pointer"
    >
      <title>{code}</title>
      <ToothShape
        kind={toothKind(code)}
        className={clsx(
          'transition-colors',
          selected
            ? 'fill-brand-500 stroke-brand-600'
            : 'fill-white stroke-surface-border hover:fill-brand-50 dark:fill-[#1e2533] dark:stroke-[#2f3745] dark:hover:fill-brand-900/30',
        )}
      />
      <text
        x={10}
        y={9.5}
        textAnchor="middle"
        className={clsx(
          'select-none text-[6px] font-semibold',
          selected ? 'fill-white' : 'fill-ink-soft dark:fill-[#c8ced9]',
        )}
      >
        {label}
      </text>
    </g>
  )
}

export default function ToothChart({
  value,
  onChange,
  labels,
}: {
  value: number[]
  onChange: (v: number[]) => void
  labels: Record<string, string>
}) {
  function toggle(code: number) {
    onChange(value.includes(code) ? value.filter((c) => c !== code) : [...value, code].sort())
  }

  return (
    <div className="mx-auto w-full max-w-lg rounded-lg border border-surface-border bg-surface-muted/40 p-2 dark:border-[#2f3745]">
      <svg viewBox={`0 ${VIEW_MIN_Y} ${VIEW_W} ${VIEW_H}`} className="w-full" role="img" aria-label="Tishlar chizmasi">
        {UPPER_POS.map(({ code, x, y }) => (
          <Tooth
            key={code}
            x={x}
            y={y}
            code={code}
            label={labels[String(code)] ?? String(code)}
            selected={value.includes(code)}
            onClick={() => toggle(code)}
          />
        ))}
        {LOWER_POS.map(({ code, x, y }) => (
          <Tooth
            key={code}
            x={x}
            y={y}
            code={code}
            label={labels[String(code)] ?? String(code)}
            selected={value.includes(code)}
            onClick={() => toggle(code)}
          />
        ))}
      </svg>
    </div>
  )
}
