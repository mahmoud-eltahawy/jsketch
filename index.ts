
const FPS = 180
const TOTAL_FRAMES = 1000
const TOTAL_SECONDS = TOTAL_FRAMES / FPS
const DDT = 1000/FPS
const colors = ["#FFFF77", "#FF2000", "#EEFF00", "#EE9999", "#88DD88", "#DD88DD"];

let scale_x = 10
let scale_y = 10
const DDX = 2 * scale_x / TOTAL_FRAMES

const draw_box = document.getElementById("box") as HTMLCanvasElement
const ctx = draw_box.getContext("2d")!

function size() : number {
  return Math.min(window.innerHeight,window.innerWidth)
}

function resize() {
  const s = size()
  draw_box.width = s
  draw_box.height = s
  clear()
}
resize()

addEventListener("resize",resize)

function normailze({x,y} : Vec2) : Vec2 {
  const zero = size() / 2
  return {
    x : zero * ( 1 + x/scale_x),
    y : zero * ( 1 - y/scale_y)
  }
}

function draw_point(vec2 : Vec2,size = 10,color = "#00FF00") {
  const {x,y} = normailze(vec2)
  ctx.fillStyle = color
  ctx.fillRect(x - size/2,y - size/2,size,size)
}

function draw_line(begin : Vec2,end: Vec2,width = 2, color = "#FFFFFF") {
  const nbegin = normailze(begin) 
  const nend = normailze(end) 
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.beginPath()
  ctx.moveTo(nbegin.x,nbegin.y)
  ctx.lineTo(nend.x,nend.y)
  ctx.stroke()
}

function clear() {
  ctx.fillStyle = "#000000"
  ctx.fillRect(0,0,size(),size())
  draw_line({x : -scale_x,y : 0},{x : scale_x, y : 0},3)
  draw_line({y : -scale_y,x : 0},{y : scale_y, x : 0},3)

  for (let i = -scale_y; i <= scale_y; i++) {
    draw_line({x : -scale_x,y : i},{x : scale_x,y : i},1)
    draw_line({x : -scale_x,y : i + 0.5},{x : scale_x,y : i + 0.5},0.3)
  }
  for (let i = -scale_x; i <= scale_x; i++) {
    draw_line({y : -scale_y,x : i},{y : scale_y,x : i},1)
    draw_line({y : -scale_y,x : i + 0.5},{y : scale_y,x : i + 0.5},0.3)
  }
}
clear()

type Vec2 = {
  x : number,
  y : number
}

type Shape = {
  vertices : Vec2[],
  draw_progress : number,
  color : string,
  tf : 1 | 2 | 3,
  size : number
}

const shapes : Shape[] = []

function F(fun : (_: number) => number,miror_x = false,miror_y = false) : number{
  let x = -scale_x
  let vertices : Vec2[]= []
  for (let i = 0; i < TOTAL_FRAMES; i++) {
    const y = fun(x)
    if (isNaN(y) || y < -scale_y || y > scale_y) {
      x+=DDX
      continue
    }
    vertices.push({x,y})
    if (miror_x) {
      vertices.push({x,y : -y})
    }
    if (miror_y) {
      vertices.push({x,y :fun(-x)})
    }
    x+=DDX
  }
  const index = shapes.length
  shapes.push({
    vertices,
    draw_progress : 0,
    color : colors[index % colors.length],
    tf : miror_x && miror_y ? 3 : miror_x || miror_y ? 2 : 1,
    size : 2
  })
  return index
}

function draw(index : number) {
  const shape = shapes.at(index)
  if (!shape) {
    throw "shape is not initialzied"
  }
  for (let i = 0; i < TOTAL_FRAMES; i++) {
    setTimeout(() => {
      draw_point(shape.vertices[i],shape.size,shape.color)
    },DDT * i)
  }
}
