(load "./other.scm")

(clear-all-shapes)
(define sid (sin-shape 1 1 0 8))
(time/sleep-ms 3000)
(circle-shape 2 1 1 1 60)
(time/sleep-ms 2000)
(circle-shape 4 1 1 1 60)
(time/sleep-ms 1000)
(circle-shape (square 4) 1 1 1 60)
(clear-shape sid)



