"strict";
/** @type {number} */
const FPS = 180;
/** @type {number} */
const TOTAL_FRAMES = 1000;
/** @type {number} */
const TOTAL_SECONDS = TOTAL_FRAMES / FPS;
/** @type {number} */
const DDT = 1000 / FPS;

const box =/** @type {HTMLCanvasElement} */ (document.getElementById("box"))

const ctx =/** @type {CanvasRenderingContext2D} */ (box.getContext("2d"))

/**
 * @callback Fx
 * @param {number} x - The x coordinate.
 * @returns {number} The Y coordinate.
 */

/** @type {number} */
let box_size = 0;

class Vec2 {
    /** @type {number} */
    xin;
    /** @type {number} */
    yin;
    /**
    * @param {number} x
    * @param {number} y
    */
    constructor(x, y) {
        this.xin = x;
        this.yin = y;
    }
    /**
    * @returns {number}
    */
    get x() {
        return box_size / 2 * (1 + this.xin / drawer.scale);
    }
    /**
    * @returns {number}
    */
    get y() {
        return box_size / 2 * (1 - this.yin / drawer.scale);
    }
    /**
    * @param {number} x
    * @param {number} y
    * @returns {Vec2}
    */
    sum(x, y) {
        return new Vec2(this.xin + x, this.yin + y);
    }
    /**
    * @returns {Vec2}
    */
    neg_y() {
        return new Vec2(this.xin, -this.yin);
    }
    /**
    * @returns {Vec2}
    */
    neg_x() {
        return new Vec2(-this.xin, this.yin);
    }
    /**
    * @returns {boolean}
    */
    get in_range() {
        return [this.xin, this.yin]
            .every(m => m > -drawer.scale && m < drawer.scale);
    }
    /**
    * @param {number} size
    * @param {string} color
    */
    draw_point(size = 10, color = "#00FF00") {
        ctx.fillStyle = color;
        ctx.fillRect(this.x - size / 2, this.y - size / 2, size, size);
    }
    /**
    * @param {string} text
    * @param {number} font_size
    * @param {string} color
    */
    draw_text(text, font_size = 14, color = "#00FFFF") {
        ctx.fillStyle = color;
        ctx.font = `${font_size}px sans-serif`;
        ctx.fillText(text, this.x, this.y);
    }
}

class Line {
    /** @type {Vec2} */
    start;
    /** @type {Vec2} */
    end;
    /**
    * @param {[number,number]} start
    * @param {[number,number]} end
    */
    constructor(start, end) {
        const [sx, sy] = start;
        const [ex, ey] = end;
        this.start = new Vec2(sx, sy);
        this.end = new Vec2(ex, ey);
    }
    /**
    * @param {number} size
    * @param {string} color
    */
    draw(size = 2, color = "#FFFFFF") {
        ctx.strokeStyle = color;
        ctx.lineWidth = size;
        ctx.beginPath();
        ctx.moveTo(this.start.x, this.start.y);
        ctx.lineTo(this.end.x, this.end.y);
        ctx.stroke();
    }
}
class FOfX {
    /** @type {number} */
    static len = 0;
    /** @type {string[]} */
    #colors = ["#FFFF77", "#FF2000", "#EEFF00", "#EE9999", "#88DD88", "#DD88DD"];
    /** @type {Fx} */
    fun;
    /** @type {?number} */
    #miror_x_with = null;
    /** @type {boolean} */
    miror_y;
    /** @type {Vec2[]} */
    points = [];
    /** @type {number} */
    factor;
    /** @type {number} */
    index;
    /** @type {[number,number]} */
    #limits = [-drawer.scale, drawer.scale];
    /**
    * @param {Fx} fun
    * @param {boolean} miror_y
    */
    constructor(fun, miror_y = false) {
        this.fun = fun;
        this.miror_y = miror_y;
        this.factor = miror_y ? 2 : 1;
        this.index = FOfX.len;
        FOfX.len += 1;
    }
    /**
    * @param {?number} x
    */
    set_miror_x(x) {
        this.#miror_x_with = x;
        this.refactor();
    }
    refactor() {
        this.factor = this.#miror_x_with !== null && this.miror_y ? 3 : this.#miror_x_with !== null || this.miror_y ? 2 : 1;
    }
    /**
    * @param {number} begin
    * @param {number} end
    */
    set_limits(begin, end) {
        this.#limits = [
            Math.max(begin, -drawer.scale),
            Math.min(end, drawer.scale)
        ];
    }
    /**
    * @returns {number} 
    */
    #ddx() {
        const [begin, end] = this.#limits;
        return (end - begin) / TOTAL_FRAMES;
    }
    draw() {
        const [begin, end] = this.#limits;
        const ddx = this.#ddx();
        for (let x = begin; x < end; x += ddx) {
            const y = this.fun(x);
            if (isNaN(y)) {
                continue;
            }
            const point = new Vec2(x, y);
            if (!point.in_range) {
                continue;
            }
            if (this.#miror_x_with !== null) {
                this.points.push(point.sum(0, this.#miror_x_with));
                this.points.push(point.neg_y().sum(0, this.#miror_x_with));
            }
            else {
                this.points.push(point);
            }
            if (this.miror_y) {
                this.points.push(new Vec2(x, -this.fun(x)));
            }
        }
        this.#draw(0);
    }
    /**
    * @param {number} fi
    */
    #draw(fi) {
        const p = this.points[fi];
        if (p) {
            p.draw_point(2, this.#colors[this.index % this.#colors.length]);
        }
        if (fi < TOTAL_FRAMES * this.factor - 1) {
            setTimeout(() => this.#draw(fi + 1), DDT / this.factor);
        }
    }
}
class Drawer {
    /** @type {Drawer} */
    static #instance = new Drawer();
    /** @type {number} */
    #graident = 3;
    /** @type {string} */
    #background_color = "#000000";
    /** @type {FOfX[]} */
    #fofxs = [];
    /** @type {number} */
    #scale = 10;
    constructor() { }
    static new() {
        return Drawer.#instance;
    }
    /**
    * @param {number} scale
    */
    rescale(scale) {
        this.#scale = scale;
        this.clear();
    }
    /**
    * @returns {number} 
    */
    get scale() {
        return this.#scale;
    }
    /**
    * @param {0 | 1 | 2 | 3} g
    */
    set_gradient_level(g) {
        if (![0, 1, 2, 3].includes(g)) {
            throw "input range = [0..3]";
        }
        this.#graident = g;
        this.clear();
    }
    clear() {
        this.clear_background();
        this.draw_gradient();
    }
    clear_background() {
        ctx.fillStyle = this.#background_color;
        ctx.fillRect(0, 0, box_size, box_size);
    }
    draw_gradient() {
        if (this.#graident === 0) {
            return;
        }
        if (this.#graident >= 1) {
            new Line([-this.#scale, 0], [this.#scale, 0]).draw(3);
            new Line([0, -this.#scale], [0, this.#scale]).draw(3);
            if (this.#graident === 1) {
                return;
            }
        }
        for (let i = -this.#scale; i <= this.#scale; i++) {
            new Vec2(0, i).draw_text(i.toString());
            new Line([-this.#scale, i], [this.#scale, i]).draw(1);
            if (this.#graident === 3) {
                new Line([-this.#scale, i + 0.5], [this.#scale, i + 0.5]).draw(0.3);
            }
        }
        for (let i = -this.#scale; i <= this.#scale; i++) {
            new Vec2(i, 0).draw_text(i.toString());
            new Line([i, -this.#scale], [i, this.#scale]).draw(1);
            if (this.#graident === 3) {
                new Line([i + 0.5, -this.#scale], [i + 0.5, this.#scale]).draw(0.3);
            }
        }
    }
    /**
    * @param {Fx} fun
    * @param {?number} miror_x_with
    * @param {boolean} miror_y
    */
    f(fun, miror_x_with = null, miror_y = false) {
        const f_of_x = new FOfX(fun, miror_y);
        f_of_x.set_miror_x(miror_x_with);
        this.#fofxs.push(f_of_x);
        f_of_x.draw();
        return f_of_x;
    }
    /**
    * @param {number} radius
    * @param {[number,number]} center
    */
    circle(radius, center = [0, 0]) {
        const [cx, cy] = center;
        const f_of_x = new FOfX((x => Math.sqrt(radius ** 2 - (x - cx) ** 2)));
        f_of_x.set_limits(cx - radius, cx + radius);
        f_of_x.set_miror_x(cy);
        this.#fofxs.push(f_of_x);
        f_of_x.draw();
    }
}
const drawer = Drawer.new();
const resize = () => {
    const PADDING = 20;
    box_size = Math.min(innerHeight, innerWidth) - PADDING;
    box.width = box_size;
    box.height = box_size;
    drawer.clear();
};
resize();
addEventListener("resize", resize);
