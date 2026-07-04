export function createCountdownRing(progressPercent: number): HTMLElement {
  const ring = document.createElement("span")
  ring.className = "cognitive-delta-countdown-ring"
  ring.setAttribute("aria-hidden", "true")
  ring.style.setProperty("--cognitive-delta-progress", `${progressPercent}%`)
  return ring
}
