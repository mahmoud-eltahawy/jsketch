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


(define (make-curve f start end steps)
  (let ((step (/ (- end start) (- steps 1))))
    (let loop ((i 0) (acc '()))
      (if (= i steps)
          (reverse acc)
          (let ((x (+ start (* i step))))
            (let ((x-inexact (exact->inexact x)))
              (loop (+ i 1)
                    (cons (f x-inexact) (cons x-inexact acc)))))))))



; (define (f fx)
;   (f-shape (make-curve fx 0 3 1000)))


(define (plot-curve fx start end steps)
  (f-shape (make-curve fx start end steps)))


(define f
  (case-lambda
    [(fx)                (plot-curve fx 0 3 1000)]
    [(fx start)          (plot-curve fx start 3 1000)]
    [(fx start end)      (plot-curve fx start end 1000)]
    [(fx start end steps) (plot-curve fx start end steps)]))


(f square -6 6 3000)
