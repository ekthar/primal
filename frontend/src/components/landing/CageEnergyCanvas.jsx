import { useEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";
import * as THREE from "three";

export default function CageEnergyCanvas() {
  const mountRef = useRef(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (!mountRef.current || reducedMotion) return undefined;

    const mount = mountRef.current;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(52, mount.clientWidth / mount.clientHeight, 0.1, 100);
    camera.position.set(0, 0, 8.5);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    const octagonShape = new THREE.Shape();
    const radius = 2.8;
    for (let i = 0; i < 8; i += 1) {
      const angle = (Math.PI / 4) * i + Math.PI / 8;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (i === 0) octagonShape.moveTo(x, y);
      else octagonShape.lineTo(x, y);
    }
    octagonShape.closePath();
    const octagonGeometry = new THREE.BufferGeometry().setFromPoints(octagonShape.getPoints(128));
    const octagonMaterial = new THREE.LineBasicMaterial({ color: 0xef1a1a, transparent: true, opacity: 0.55 });
    const octagon = new THREE.LineLoop(octagonGeometry, octagonMaterial);
    scene.add(octagon);

    const innerRing = octagon.clone();
    innerRing.scale.set(0.72, 0.72, 0.72);
    innerRing.material = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12 });
    scene.add(innerRing);

    const cageSegments = new THREE.Group();
    for (let i = 0; i < 8; i += 1) {
      const angle = (Math.PI / 4) * i + Math.PI / 8;
      const panelGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(Math.cos(angle) * 2.2, Math.sin(angle) * 2.2, -0.4),
        new THREE.Vector3(Math.cos(angle) * 3.4, Math.sin(angle) * 3.4, 0.4),
      ]);
      const panel = new THREE.Line(
        panelGeometry,
        new THREE.LineBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.12 })
      );
      cageSegments.add(panel);
    }
    scene.add(cageSegments);

    const particlesCount = 220;
    const particlesGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particlesCount * 3);
    for (let i = 0; i < particlesCount; i += 1) {
      positions[i * 3] = (Math.random() - 0.5) * 11;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 6.5;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 4;
    }
    particlesGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const particlesMaterial = new THREE.PointsMaterial({
      color: 0xef4444,
      size: 0.04,
      transparent: true,
      opacity: 0.7,
    });
    const particles = new THREE.Points(particlesGeometry, particlesMaterial);
    scene.add(particles);

    const redLight = new THREE.PointLight(0xef1a1a, 2.2, 20);
    redLight.position.set(2.8, 1.6, 4.5);
    scene.add(redLight);

    const blueLight = new THREE.PointLight(0x2563eb, 1.4, 16);
    blueLight.position.set(-3.2, -1.2, 3.2);
    scene.add(blueLight);

    const ambient = new THREE.AmbientLight(0xffffff, 0.35);
    scene.add(ambient);

    let frameId = null;
    let start = performance.now();

    const onResize = () => {
      if (!mountRef.current) return;
      camera.aspect = mountRef.current.clientWidth / mountRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    };

    const animate = (time) => {
      const elapsed = (time - start) * 0.001;
      octagon.rotation.z = elapsed * 0.18;
      innerRing.rotation.z = -elapsed * 0.13;
      cageSegments.rotation.z = elapsed * 0.08;
      particles.rotation.z = elapsed * 0.03;
      camera.position.x = Math.sin(elapsed * 0.22) * 0.18;
      camera.position.y = Math.cos(elapsed * 0.16) * 0.12;
      camera.lookAt(0, 0, 0);

      const particlePositions = particlesGeometry.attributes.position.array;
      for (let i = 0; i < particlesCount; i += 1) {
        particlePositions[i * 3 + 1] += Math.sin(elapsed + i * 0.15) * 0.0015;
      }
      particlesGeometry.attributes.position.needsUpdate = true;

      renderer.render(scene, camera);
      frameId = window.requestAnimationFrame(animate);
    };

    window.addEventListener("resize", onResize);
    frameId = window.requestAnimationFrame(animate);

    return () => {
      window.removeEventListener("resize", onResize);
      if (frameId) window.cancelAnimationFrame(frameId);
      renderer.dispose();
      particlesGeometry.dispose();
      particlesMaterial.dispose();
      octagonGeometry.dispose();
      octagonMaterial.dispose();
      innerRing.material.dispose();
      cageSegments.children.forEach((panel) => {
        panel.geometry.dispose();
        panel.material.dispose();
      });
      mount.removeChild(renderer.domElement);
    };
  }, [reducedMotion]);

  return (
    <div className="absolute inset-0 -z-30 overflow-hidden">
      <div ref={mountRef} className="absolute inset-0" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(239,26,26,0.18),transparent_42%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,8,8,0.02)_0%,rgba(8,8,8,0.55)_62%,rgba(8,8,8,0.82)_100%)]" />
    </div>
  );
}
