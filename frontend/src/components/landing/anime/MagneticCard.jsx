import { useRef } from "react";
import { motion, useMotionValue, useSpring, useTransform, useReducedMotion } from "framer-motion";

/**
 * MagneticCard — a wrapper that applies a 3D tilt and subtle lift on hover.
 * The pointer position relative to the card's center is mapped to rotateY /
 * rotateX (clamped to ±maxTilt) and a small translateZ for depth. Springs
 * smooth the values so the card glides rather than snapping.
 *
 * Touch / reduced-motion users get the unanimated content as-is.
 *
 * Pass any extra className for layout; the wrapper itself only sets
 * `transform-style: preserve-3d` and a perspective.
 */
export default function MagneticCard({
  children,
  maxTilt = 8,
  className = "",
  perspective = 900,
}) {
  const ref = useRef(null);
  const reduced = useReducedMotion();

  const rx = useMotionValue(0);
  const ry = useMotionValue(0);
  const lift = useMotionValue(0);

  const sx = useSpring(rx, { stiffness: 220, damping: 20 });
  const sy = useSpring(ry, { stiffness: 220, damping: 20 });
  const sl = useSpring(lift, { stiffness: 220, damping: 20 });
  const translateZ = useTransform(sl, [0, 1], [0, 18]);

  if (reduced) {
    return <div className={className}>{children}</div>;
  }

  const onMove = (event) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    ry.set(x * maxTilt * 2);
    rx.set(-y * maxTilt * 2);
    lift.set(1);
  };
  const onLeave = () => {
    rx.set(0);
    ry.set(0);
    lift.set(0);
  };

  return (
    <motion.div
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      style={{
        rotateX: sx,
        rotateY: sy,
        translateZ,
        transformPerspective: perspective,
        transformStyle: "preserve-3d",
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
