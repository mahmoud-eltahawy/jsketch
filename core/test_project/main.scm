(load "./other.scm")

(clear-all-shapes)
(define sid (sin-shape 1 1 0 8))
(time/sleep-ms 3000)
(circle-shape 2 1 1 1 1)
(time/sleep-ms 2000)
(circle-shape 4 1 1 1 3)
(time/sleep-ms 1000)
(circle-shape (square 3) 1 1 1 6)
(clear-shape sid)

(f-shape square 0.0 4.0)
