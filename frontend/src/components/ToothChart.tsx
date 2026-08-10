import { useMemo } from 'react'
import clsx from 'clsx'

// FDI (xalqaro) tartibida: har qatorda o'ng yarim, keyin chap yarim (o'rtada jag' chizig'i)
export const UPPER_RIGHT = [18, 17, 16, 15, 14, 13, 12, 11]
export const UPPER_LEFT = [21, 22, 23, 24, 25, 26, 27, 28]
export const LOWER_RIGHT = [48, 47, 46, 45, 44, 43, 42, 41]
export const LOWER_LEFT = [31, 32, 33, 34, 35, 36, 37, 38]

const UPPER_ORDER = [...UPPER_RIGHT, ...UPPER_LEFT]
const LOWER_ORDER = [...LOWER_RIGHT, ...LOWER_LEFT]

const BASE_SCALE = 2.6
// Admin → Общие настройки → Номера зубов dagi kabi — har bir katakcha bir xil o'lchamda
const LOCAL_SIZE = 16
const GAP = 5
const LOCAL_CX = LOCAL_SIZE / 2
const LOCAL_CY = LOCAL_SIZE / 2

function straightRow(order: number[], cy: number, slot: number) {
  const n = order.length
  const total = n * slot + (n - 1) * GAP
  const centers: number[] = []
  for (let i = 0; i < n; i++) {
    centers.push(i * (slot + GAP) + slot / 2)
  }
  const halfWidth = total / 2
  const mid = n / 2
  const midX = (centers[mid - 1] + centers[mid]) / 2 - halfWidth

  return {
    total,
    midX,
    positions: order.map((code, i) => ({ code, x: centers[i] - halfWidth, y: cy })),
  }
}

/**
 * Butun sxema joylashuvi — Admin → Общие настройки dagi «Размер зубов»
 * foizi (scalePercent, hammaga umumiy) ga qarab qayta hisoblanadi.
 * Oddiy to'g'ri qator (aylana/oval emas), tartib — massivda qanday yozilgan
 * bo'lsa (UPPER_RIGHT+UPPER_LEFT, LOWER_RIGHT+LOWER_LEFT) shunday qoladi.
 */
function buildLayout(scalePercent: number) {
  const scale = BASE_SCALE * (scalePercent / 100)
  const slot = LOCAL_SIZE * scale
  const boxHalf = slot / 2
  const rowCyUpper = 20
  const rowCyLower = 20 + boxHalf * 2 + 26

  const upperRow = straightRow(UPPER_ORDER, rowCyUpper, slot)
  const lowerRow = straightRow(LOWER_ORDER, rowCyLower, slot)

  const chartWidth = Math.max(upperRow.total, lowerRow.total)
  const marginX = 16
  const marginTop = boxHalf + 14
  const marginBottom = boxHalf + 14
  const viewW = chartWidth + marginX * 2
  const viewMinY = -marginTop
  const viewH = rowCyLower + marginBottom + marginTop
  const xCenter = viewW / 2

  return {
    scale,
    boxHalf,
    rowCyUpper,
    rowCyLower,
    viewW,
    viewMinY,
    viewH,
    upperPos: upperRow.positions.map((p) => ({ ...p, x: p.x + xCenter })),
    lowerPos: lowerRow.positions.map((p) => ({ ...p, x: p.x + xCenter })),
    upperMidX: upperRow.midX + xCenter,
    lowerMidX: lowerRow.midX + xCenter,
  }
}

// Tishning siluetiga o'xshatishga urinilmaydi — Admin → Общие настройки →
// Номера зубовdagi kabi barcha katakchalar bir xil o'lchamda, oddiy dumaloq
// burchakli kvadrat. Ustiga o'sha sozlamadan olingan yorliq (raqam) yoziladi.
function ToothShape({ className }: { className: string }) {
  return (
    <rect
      x={0}
      y={0}
      width={LOCAL_SIZE}
      height={LOCAL_SIZE}
      rx={3}
      ry={3}
      strokeWidth={1}
      className={className}
    />
  )
}

function Tooth({
  x,
  y,
  code,
  label,
  selected,
  scale,
  onClick,
}: {
  x: number
  y: number
  code: number
  label: string
  selected: boolean
  scale: number
  onClick: () => void
}) {
  return (
    <g
      transform={`translate(${x - scale * LOCAL_CX}, ${y - scale * LOCAL_CY}) scale(${scale})`}
      onClick={onClick}
      className="cursor-pointer"
    >
      <title>{code}</title>
      <ToothShape
        className={clsx(
          'transition-colors',
          selected
            ? 'fill-brand-500 stroke-brand-600'
            : 'fill-white stroke-surface-border hover:fill-brand-50 dark:fill-[#1e2533] dark:stroke-[#2f3745] dark:hover:fill-brand-900/30',
        )}
      />
      <text
        x={LOCAL_CX}
        y={LOCAL_CY}
        textAnchor="middle"
        dominantBaseline="central"
        className={clsx(
          'select-none text-[6.5px] font-semibold',
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
  scalePercent = 100,
}: {
  value: number[]
  onChange: (v: number[]) => void
  labels: Record<string, string>
  scalePercent?: number
}) {
  const layout = useMemo(() => buildLayout(scalePercent), [scalePercent])

  function toggle(code: number) {
    onChange(value.includes(code) ? value.filter((c) => c !== code) : [...value, code].sort())
  }

  return (
    <div className="mx-auto w-full max-w-2xl rounded-lg border border-surface-border bg-surface-muted/40 p-2 dark:border-[#2f3745]">
      <svg
        viewBox={`0 ${layout.viewMinY} ${layout.viewW} ${layout.viewH}`}
        className="w-full"
        role="img"
        aria-label="Tishlar chizmasi"
      >
        {/* O'ng va chap yarimni ajratuvchi chiziq — Admin → Общие настройки → Номера зубовdagi kabi */}
        <line
          x1={layout.upperMidX} x2={layout.upperMidX}
          y1={layout.rowCyUpper - layout.boxHalf - 4} y2={layout.rowCyUpper + layout.boxHalf + 4}
          strokeWidth={1}
          className="stroke-surface-border dark:stroke-[#2f3745]"
        />
        <line
          x1={layout.lowerMidX} x2={layout.lowerMidX}
          y1={layout.rowCyLower - layout.boxHalf - 4} y2={layout.rowCyLower + layout.boxHalf + 4}
          strokeWidth={1}
          className="stroke-surface-border dark:stroke-[#2f3745]"
        />
        {layout.upperPos.map(({ code, x, y }) => (
          <Tooth
            key={code}
            x={x}
            y={y}
            code={code}
            label={labels[String(code)] ?? String(code)}
            selected={value.includes(code)}
            scale={layout.scale}
            onClick={() => toggle(code)}
          />
        ))}
        {layout.lowerPos.map(({ code, x, y }) => (
          <Tooth
            key={code}
            x={x}
            y={y}
            code={code}
            label={labels[String(code)] ?? String(code)}
            selected={value.includes(code)}
            scale={layout.scale}
            onClick={() => toggle(code)}
          />
        ))}
      </svg>
    </div>
  )
}
