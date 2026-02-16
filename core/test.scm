(define (factorial n)
  (if (<= n 1)
      1
      (* n (factorial (- n 1)))))

(display "Computing factorial of 5...\n")
(factorial 5)
(rust-multiply 2 3)
