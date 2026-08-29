import { useEffect, useRef } from 'react';

interface LiquidEtherProps {
  colors?: string[];
  speed?: number;
  distortion?: number;
  className?: string;
}

export default function LiquidEther({
  speed = 0.6,
  distortion = 1.2,
  className = ''
}: LiquidEtherProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl', {
      alpha: true,
      antialias: false,
      powerPreference: 'high-performance'
    });

    if (!gl) {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      let animId: number;
      let t = 0;
      const render2D = () => {
        t += 0.01;
        ctx.fillStyle = '#08080c';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const grad = ctx.createRadialGradient(
          canvas.width * 0.5 + Math.sin(t) * 100,
          canvas.height * 0.5 + Math.cos(t) * 100,
          20,
          canvas.width * 0.5,
          canvas.height * 0.5,
          canvas.width * 0.6
        );
        grad.addColorStop(0, 'rgba(238, 44, 36, 0.18)');
        grad.addColorStop(0.5, 'rgba(139, 92, 246, 0.12)');
        grad.addColorStop(1, 'rgba(8, 8, 12, 0.95)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        animId = requestAnimationFrame(render2D);
      };
      render2D();
      return () => cancelAnimationFrame(animId);
    }

    const vsSource = `
      attribute vec2 a_position;
      varying vec2 v_uv;
      void main() {
        v_uv = (a_position + 1.0) * 0.5;
        gl_Position = vec4(a_position, 0.0, 1.0);
      }
    `;

    const fsSource = `
      precision highp float;
      varying vec2 v_uv;
      uniform vec2 u_resolution;
      uniform vec2 u_mouse;
      uniform float u_time;
      uniform float u_distortion;

      vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
      vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
      vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

      float snoise(vec2 v) {
        const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                           -0.577350269189626, 0.024390243902439);
        vec2 i  = floor(v + dot(v, C.yy) );
        vec2 x0 = v -   i + dot(i, C.xx);
        vec2 i1;
        i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
        vec4 x12 = x0.xyxy + C.xxzz;
        x12.xy -= i1;
        i = mod289(i);
        vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
              + i.x + vec3(0.0, i1.x, 1.0 ));
        vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
        m = m*m ;
        m = m*m ;
        vec3 x = 2.0 * fract(p * C.www) - 1.0;
        vec3 h = abs(x) - 0.5;
        vec3 ox = floor(x + 0.5);
        vec3 a0 = x - ox;
        m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
        vec3 g;
        g.x  = a0.x  * x0.x  + h.x  * x0.y;
        g.yz = a0.yz * x12.xz + h.yz * x12.yw;
        return 130.0 * dot(m, g);
      }

      void main() {
        vec2 st = gl_FragCoord.xy / u_resolution.xy;
        st.x *= u_resolution.x / u_resolution.y;

        vec2 mouse = u_mouse / u_resolution.xy;
        mouse.x *= u_resolution.x / u_resolution.y;

        float distToMouse = distance(st, mouse);
        float mouseInfluence = smoothstep(0.45, 0.0, distToMouse);

        float t = u_time * 0.4;
        vec2 q = vec2(0.0);
        q.x = snoise(st + vec2(t * 0.2, t * 0.3));
        q.y = snoise(st + vec2(1.0));

        vec2 r = vec2(0.0);
        r.x = snoise(st + 1.0 * q + vec2(1.7, 9.2) + 0.15 * t + mouseInfluence * 0.3);
        r.y = snoise(st + 1.0 * q + vec2(8.3, 2.8) + 0.126 * t - mouseInfluence * 0.2);

        float f = snoise(st + r * u_distortion);

        vec3 c1 = vec3(0.03, 0.03, 0.05);
        vec3 c2 = vec3(0.93, 0.17, 0.14);
        vec3 c3 = vec3(0.55, 0.23, 0.96);
        vec3 c4 = vec3(0.02, 0.71, 0.83);

        vec3 color = mix(c1, c2, clamp((f*f)*3.0, 0.0, 1.0));
        color = mix(color, c3, clamp(length(q) * 0.6, 0.0, 1.0));
        color = mix(color, c4, clamp(length(r.x) * 0.5, 0.0, 1.0));

        vec2 uv = gl_FragCoord.xy / u_resolution.xy;
        float vignette = uv.x * uv.y * (1.0 - uv.x) * (1.0 - uv.y);
        vignette = clamp(pow(16.0 * vignette, 0.25), 0.0, 1.0);

        gl_FragColor = vec4(color * vignette, 0.92);
      }
    `;

    function createShader(glCtx: WebGLRenderingContext, type: number, source: string) {
      const shader = glCtx.createShader(type);
      if (!shader) return null;
      glCtx.shaderSource(shader, source);
      glCtx.compileShader(shader);
      if (!glCtx.getShaderParameter(shader, glCtx.COMPILE_STATUS)) {
        glCtx.deleteShader(shader);
        return null;
      }
      return shader;
    }

    const vertexShader = createShader(gl, gl.VERTEX_SHADER, vsSource);
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
    if (!vertexShader || !fragmentShader) return;

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      return;
    }

    gl.useProgram(program);

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );

    const aPositionLocation = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(aPositionLocation);
    gl.vertexAttribPointer(aPositionLocation, 2, gl.FLOAT, false, 0, 0);

    const uResolutionLocation = gl.getUniformLocation(program, 'u_resolution');
    const uMouseLocation = gl.getUniformLocation(program, 'u_mouse');
    const uTimeLocation = gl.getUniformLocation(program, 'u_time');
    const uDistortionLocation = gl.getUniformLocation(program, 'u_distortion');

    let mouseX = window.innerWidth * 0.5;
    let mouseY = window.innerHeight * 0.5;
    let targetMouseX = mouseX;
    let targetMouseY = mouseY;

    const onMouseMove = (e: MouseEvent) => {
      targetMouseX = e.clientX;
      targetMouseY = window.innerHeight - e.clientY;
    };

    window.addEventListener('mousemove', onMouseMove, { passive: true });

    const resize = () => {
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      gl.viewport(0, 0, canvas.width, canvas.height);
    };

    window.addEventListener('resize', resize);
    resize();

    let animationId: number;
    let startTime = performance.now();

    const render = (now: number) => {
      const elapsedTime = (now - startTime) * 0.001 * speed;

      mouseX += (targetMouseX - mouseX) * 0.05;
      mouseY += (targetMouseY - mouseY) * 0.05;

      gl.uniform2f(uResolutionLocation, canvas.width, canvas.height);
      gl.uniform2f(uMouseLocation, mouseX * (canvas.width / window.innerWidth), mouseY * (canvas.height / window.innerHeight));
      gl.uniform1f(uTimeLocation, elapsedTime);
      gl.uniform1f(uDistortionLocation, distortion);

      gl.drawArrays(gl.TRIANGLES, 0, 6);
      animationId = requestAnimationFrame(render);
    };

    animationId = requestAnimationFrame(render);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationId);
    };
  }, [speed, distortion]);

  return (
    <canvas
      ref={canvasRef}
      className={`fixed inset-0 w-full h-full pointer-events-none z-0 ${className}`}
      style={{ opacity: 0.85 }}
    />
  );
}