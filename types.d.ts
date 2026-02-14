
export type Vec2 = {
  x : number,
  y : number
}

export type Shape = {
  vertices : Vec2[],
  draw_progress : number,
  color : string,
  tf : 1 | 2 | 3,
  size : number
}
