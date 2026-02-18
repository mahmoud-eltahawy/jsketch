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


(define (exp-curve)
  (let ((start -4.0)
        (end 4.0)
        (steps 1000))
    (let ((step (/ (- end start) (- steps 1))))
      ;; Iterate from end down to start, building the flat list in correct order.
      (let loop ((x end) (points '()))
        (if (< x start)
            points
            (loop (- x step)
                  (cons x (cons (exp x) points))))))))


(f-shape (exp-curve))

