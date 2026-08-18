export interface ScrollView {
  readonly scrollTop: number;
  readonly scrollHeight: number;
  readonly clientHeight: number;
}

/** Alul van-e a nézet (a küszöbön belül)? Alapból 64 px a tűrés. */
export function isNearBottom(view: ScrollView, threshold = 64): boolean {
  return view.scrollHeight - view.scrollTop - view.clientHeight <= threshold;
}
