import { useRef, useEffect } from 'react';
import type { ReactNode } from 'react';

interface HeroProps {
  trustBadge?: {
    text: string;
    icons?: string[];
  };
  headline: {
    line1: string;
    line2: string;
  };
  subtitle: string;
  buttons?: {
    primary?: { text: string; onClick?: () => void };
    secondary?: { text: string; onClick?: () => void };
  };
  sideContent?: ReactNode;
  className?: string;
}

const defaultShaderSource = `#version 300 es
/*
 * made by Matthias Hurrle (@atzedent)
 */
precision highp float;
out vec4 O;
uniform vec2 resolution;
uniform float time;
uniform vec2 move;
uniform vec2 touch;
uniform int pointerCount;
uniform vec2 pointers;
#define FC gl_FragCoord.xy
#define T time
#define R resolution
#define MN min(R.x,R.y)
float rnd(vec2 p) {
  p=fract(p*vec2(12.9898,78.233));
  p+=dot(p,p+34.56);
  return fract(p.x*p.y);
}
float noise(in vec2 p) {
  vec2 i=floor(p), f=fract(p), u=f*f*(3.-2.*f);
  float a=rnd(i), b=rnd(i+vec2(1,0)), c=rnd(i+vec2(0,1)), d=rnd(i+1.);
  return mix(mix(a,b,u.x),mix(c,d,u.x),u.y);
}
float fbm(vec2 p) {
  float t=.0, a=1.; mat2 m=mat2(1.,-.5,.2,1.2);
  for (int i=0; i<5; i++) { t+=a*noise(p); p*=2.*m; a*=.5; }
  return t;
}
float clouds(vec2 p) {
  float d=1., t=.0;
  for (float i=.0; i<3.; i++) {
    float a=d*fbm(i*10.+p.x*.2+.2*(1.+i)*p.y+d+i*i+p);
    t=mix(t,d,a); d=a; p*=2./(i+1.);
  }
  return t;
}
void main(void) {
  vec2 uv=(FC-.5*R)/MN, st=uv*vec2(2,1);
  vec3 col=vec3(0);
  float bg=clouds(vec2(st.x+T*.5,-st.y));
  uv*=1.-.3*(sin(T*.2)*.5+.5);
  for (float i=1.; i<12.; i++) {
    uv+=.1*cos(i*vec2(.1+.01*i, .8)+i*i+T*.5+.1*uv.x);
    vec2 p=uv;
    float d=length(p);
    col+=.00125/d*(cos(sin(i)*vec3(1,2,3))+1.);
    float b=noise(i+p+bg*1.731);
    col+=.002*b/length(max(p,vec2(b*p.x*.02,p.y)));
    col=mix(col,vec3(bg*.25,bg*.137,bg*.05),d);
  }
  O=vec4(col,1);
}`;

const useShaderBackground = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl2');
    if (!gl) return;

    const dpr = Math.max(1, 0.5 * window.devicePixelRatio);
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    gl.viewport(0, 0, canvas.width, canvas.height);

    const vertexSrc = `#version 300 es\nprecision highp float;\nin vec4 position;\nvoid main(){gl_Position=position;}`;
    const vertices = new Float32Array([-1, 1, -1, -1, 1, 1, 1, -1]);

    const compileShader = (type: number, source: string): WebGLShader | null => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('Shader error:', gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const vs = compileShader(gl.VERTEX_SHADER, vertexSrc);
    const fs = compileShader(gl.FRAGMENT_SHADER, defaultShaderSource);
    if (!vs || !fs) return;

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    const position = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const uResolution = gl.getUniformLocation(program, 'resolution');
    const uTime = gl.getUniformLocation(program, 'time');
    const uMove = gl.getUniformLocation(program, 'move');
    const uTouch = gl.getUniformLocation(program, 'touch');
    const uPointerCount = gl.getUniformLocation(program, 'pointerCount');
    const uPointers = gl.getUniformLocation(program, 'pointers');

    let mouseX = 0;
    let mouseY = 0;

    const onMove = (e: PointerEvent) => {
      mouseX = e.clientX * dpr;
      mouseY = canvas.height - e.clientY * dpr;
    };
    canvas.addEventListener('pointermove', onMove);

    const onResize = () => {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    window.addEventListener('resize', onResize);

    const loop = (now: number) => {
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.uniform2f(uResolution, canvas.width, canvas.height);
      gl.uniform1f(uTime, now * 1e-3);
      gl.uniform2f(uMove, mouseX, mouseY);
      gl.uniform2f(uTouch, mouseX, mouseY);
      gl.uniform1i(uPointerCount, 0);
      gl.uniform2fv(uPointers, [0, 0]);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      animationFrameRef.current = requestAnimationFrame(loop);
    };

    animationFrameRef.current = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener('resize', onResize);
      canvas.removeEventListener('pointermove', onMove);
      if (animationFrameRef.current !== undefined) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(buffer);
    };
  }, []);

  return canvasRef;
};

export function AnimatedShaderHero({
  trustBadge,
  headline,
  subtitle,
  buttons,
  sideContent,
  className = '',
}: HeroProps) {
  const canvasRef = useShaderBackground();

  const textContent = (
    <>
      {trustBadge && (
        <div className="mb-6 opacity-0 animate-fade-in-down">
          <div className="inline-flex items-center gap-2 rounded-full border border-orange-300/30 bg-orange-500/10 px-6 py-3 text-sm backdrop-blur-md">
            {trustBadge.icons?.map((icon, i) => (
              <span key={i}>{icon}</span>
            ))}
            <span className="text-orange-100">{trustBadge.text}</span>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <h1
          className="bg-gradient-to-r from-orange-300 via-yellow-400 to-amber-300 bg-clip-text text-4xl font-bold text-transparent opacity-0 animate-fade-in-up sm:text-5xl xl:text-6xl"
          style={{ animationDelay: '0.2s' }}
        >
          {headline.line1}
        </h1>
        <h1
          className="bg-gradient-to-r from-yellow-300 via-orange-400 to-red-400 bg-clip-text text-4xl font-bold text-transparent opacity-0 animate-fade-in-up sm:text-5xl xl:text-6xl"
          style={{ animationDelay: '0.4s' }}
        >
          {headline.line2}
        </h1>
      </div>

      <div className="opacity-0 animate-fade-in-up" style={{ animationDelay: '0.6s' }}>
        <p className="text-lg font-light leading-relaxed text-orange-100/90 md:text-xl">
          {subtitle}
        </p>
      </div>

      {buttons && (
        <div
          className="flex flex-col gap-4 opacity-0 animate-fade-in-up sm:flex-row"
          style={{ animationDelay: '0.8s' }}
        >
          {buttons.primary && (
            <button
              onClick={buttons.primary.onClick}
              className="rounded-full bg-gradient-to-r from-orange-500 to-yellow-500 px-8 py-4 text-lg font-semibold text-black transition-all duration-300 hover:scale-105 hover:from-orange-600 hover:to-yellow-600 hover:shadow-xl hover:shadow-orange-500/25"
            >
              {buttons.primary.text}
            </button>
          )}
          {buttons.secondary && (
            <button
              onClick={buttons.secondary.onClick}
              className="rounded-full border border-orange-300/30 bg-orange-500/10 px-8 py-4 text-lg font-semibold text-orange-100 backdrop-blur-sm transition-all duration-300 hover:scale-105 hover:border-orange-300/50 hover:bg-orange-500/20"
            >
              {buttons.secondary.text}
            </button>
          )}
        </div>
      )}
    </>
  );

  return (
    <div className={`relative h-screen w-full overflow-hidden bg-black ${className}`}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none object-contain"
        style={{ background: 'black' }}
      />

      <div className="absolute inset-0 z-10 flex items-center px-4 sm:px-6">
        <div className="mx-auto w-full max-w-6xl text-white">
          {sideContent ? (
            <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-12">
              <div className="flex flex-col gap-4 text-center lg:text-left">{textContent}</div>
              <div
                className="relative opacity-0 animate-fade-in-up"
                style={{ animationDelay: '0.4s' }}
              >
                {sideContent}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-6 text-center">{textContent}</div>
          )}
        </div>
      </div>
    </div>
  );
}
