const canvas = document.getElementById("knowledge-canvas");
const ctx = canvas.getContext("2d");

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

const labels = [
  "Daily",
  "Problems",
  "Learnings",
  "Wiki",
  "Feedback",
  "全智评",
  "Frontend",
  "LangGraph",
  "Canvas",
  "Agent",
];

let width = 0;
let height = 0;
let nodes = [];
let frame = 0;

function resizeCanvas() {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = Math.floor(width * ratio);
  canvas.height = Math.floor(height * ratio);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

  nodes = labels.map((label, index) => {
    const band = index / labels.length;
    return {
      label,
      x: width * (0.12 + ((index * 0.29) % 0.76)),
      y: height * (0.18 + ((index * 0.17) % 0.68)),
      phase: band * Math.PI * 2,
      radius: label.length > 7 ? 5 : 4,
    };
  });
}

function draw() {
  frame += prefersReducedMotion.matches ? 0 : 0.008;
  ctx.clearRect(0, 0, width, height);

  const activeNodes = nodes.map((node, index) => {
    const driftX = Math.cos(frame + node.phase) * 14;
    const driftY = Math.sin(frame * 0.8 + node.phase) * 10;
    return {
      ...node,
      x: node.x + driftX,
      y: node.y + driftY,
      index,
    };
  });

  ctx.lineWidth = 1;
  activeNodes.forEach((from, index) => {
    activeNodes.slice(index + 1).forEach((to) => {
      const distance = Math.hypot(from.x - to.x, from.y - to.y);
      if (distance > 260) return;
      const alpha = Math.max(0, 1 - distance / 260) * 0.16;
      ctx.strokeStyle = `rgba(40, 95, 77, ${alpha})`;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    });
  });

  activeNodes.forEach((node) => {
    ctx.fillStyle = "rgba(255, 252, 243, 0.72)";
    ctx.strokeStyle = "rgba(32, 37, 33, 0.2)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(node.x, node.y, node.radius + 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = node.index % 3 === 0 ? "#285f4d" : node.index % 3 === 1 ? "#315f8b" : "#c4742c";
    ctx.beginPath();
    ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
    ctx.fill();

    if (width > 720) {
      ctx.fillStyle = "rgba(32, 37, 33, 0.54)";
      ctx.font = "12px Avenir Next, system-ui, sans-serif";
      ctx.fillText(node.label, node.x + 13, node.y + 4);
    }
  });

  requestAnimationFrame(draw);
}

resizeCanvas();
draw();

window.addEventListener("resize", resizeCanvas);
