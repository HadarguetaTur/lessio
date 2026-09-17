/**
 * One palette for every status in the product, drawn from the diary's
 * materials: ruling blue for what is planned or in flight, cover teal for what
 * is done or paid, the highlighter for what is waiting on someone, the red pen
 * for what was cancelled or is overdue, ink grey for what no longer counts.
 *
 * Badges, calendar cards and legends all read from here, so a status never
 * wears two colours on two screens.
 */
export const STATUS_TONE = {
  planned: 'bg-[#eaf1f8] text-[#2c5580] border-[#c4d6e8]',
  done: 'bg-[#e3f1ef] text-[#0c4744] border-[#b5d8d3]',
  waiting: 'bg-[#fff6c2] text-[#4a3f00] border-[#f0dc6a]',
  problem: 'bg-[#fbe9ec] text-[#9b0c24] border-[#f1bcc5]',
  off: 'bg-muted text-muted-foreground border-border',
} as const

export type StatusTone = keyof typeof STATUS_TONE

/**
 * A lesson on a calendar (decision #44: status is the card's background, the
 * teacher is its stripe). A cancelled lesson goes quiet here; its title is
 * struck out by the red pen where it is rendered (`.pen-strike`).
 */
export const LESSON_STATUS_STYLES = {
  scheduled: `border ${STATUS_TONE.planned}`,
  completed: `border ${STATUS_TONE.done}`,
  no_show: `border ${STATUS_TONE.waiting}`,
  cancelled: `border ${STATUS_TONE.off}`,
} as const
