# Compute offline progress by fast-forwarding the real simulation

Offline progress runs the same tick at the same 100 ms step, without rendering, until production rates stabilise, then extrapolates those rates over the rest of the absence, capped by storage. An analytic steady-state model would be faster, but it would be a second model of trains, power and node I/O that could disagree with live play. The CPU budget is 400 ms; if the rates never settle within it, the rates from the last complete window are used.
