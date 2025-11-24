import { useState, useEffect, useRef } from 'react';
import { db } from './firebase';
import { ref, push, set, onValue } from 'firebase/database';

export default function ControlPanel() {
  // --- ESTADOS ---
  const [myCarId, setMyCarId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  // ESTADOS DE EDICIÓN (RECORTE LAZO)
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [originalImage, setOriginalImage] = useState<HTMLImageElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [points, setPoints] = useState<{x: number, y: number}[]>([]);
  const [isCut, setIsCut] = useState(false);

  // ESTADOS MINIJUEGO
  const [gameActive, setGameActive] = useState(false);
  const [timeLeft, setTimeLeft] = useState(5);
  const [clicks, setClicks] = useState(0);
  const [gameFinished, setGameFinished] = useState(false);

  // ESCUCHAR FIN DE CARRERA
  useEffect(() => {
    if (!myCarId) return;
    const activeRaceRef = ref(db, 'active_race');
    const unsubscribe = onValue(activeRaceRef, (snapshot) => {
      if (!snapshot.exists()) setTimeout(() => resetForm(), 4000);
    });
    return () => unsubscribe();
  }, [myCarId]);

  const resetForm = () => {
    setMyCarId(null); setName(''); setOriginalImage(null);
    setIsCut(false); setPoints([]); setLoading(false);
    setClicks(0); setGameFinished(false); setTimeLeft(5);
  };

  // LOGICA MINIJUEGO
  useEffect(() => {
    let interval: number;
    if (gameActive && timeLeft > 0) {
      interval = setInterval(() => setTimeLeft((p) => p - 1), 1000);
    } else if (timeLeft === 0 && gameActive) {
      setGameActive(false);
      setGameFinished(true);
    }
    return () => clearInterval(interval);
  }, [gameActive, timeLeft]);

  const startGame = () => { if (!gameFinished) { setClicks(0); setTimeLeft(5); setGameActive(true); } };
  const handleClick = (e: any) => { if(e.cancelable) e.preventDefault(); if (gameActive) setClicks(p => p + 1); };

  // --- LOGICA DE IMAGEN Y RECORTE (LAZO) ---
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
            setOriginalImage(img);
            setIsCut(false);
            setPoints([]);
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(e.target.files[0]);
    }
  };

  // Inicializar Canvas con la imagen original
  useEffect(() => {
    if (originalImage && canvasRef.current && !isCut) {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const displayWidth = 350; // Ancho fijo para móviles
        const scale = displayWidth / originalImage.width;
        canvas.width = displayWidth;
        canvas.height = originalImage.height * scale;

        ctx.drawImage(originalImage, 0, 0, canvas.width, canvas.height);
    }
  }, [originalImage, isCut]);

  // --- FUNCIONES DE DIBUJO (TOUCH & MOUSE) ---
  const getCoords = (e: any) => {
      const canvas = canvasRef.current;
      if (!canvas) return {x:0, y:0};
      const rect = canvas.getBoundingClientRect();
      // Soporte híbrido touch/mouse
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      return {
          x: clientX - rect.left,
          y: clientY - rect.top
      };
  };

  const startDrawing = (e: any) => {
      if (isCut || !originalImage) return;
      setIsDrawing(true);
      setPoints([getCoords(e)]);
  };

  const draw = (e: any) => {
      if (!isDrawing || isCut || !canvasRef.current || !originalImage) return;
      if(e.cancelable) e.preventDefault(); // Evitar scroll en móvil

      const newPoint = getCoords(e);
      const currentPoints = [...points, newPoint];
      setPoints(currentPoints);

      // Redibujar visualmente el trazo
      const ctx = canvasRef.current.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.drawImage(originalImage, 0, 0, ctx.canvas.width, ctx.canvas.height);
      
      ctx.beginPath();
      ctx.strokeStyle = '#FF4500'; // Color naranja para la línea guía
      ctx.lineWidth = 3;
      ctx.moveTo(currentPoints[0].x, currentPoints[0].y);
      currentPoints.forEach(p => ctx.lineTo(p.x, p.y));
      ctx.stroke();
  };

  const stopDrawing = () => {
      setIsDrawing(false);
  };

  // --- APLICAR EL RECORTE (LA MAGIA) ---
  const applyCut = () => {
      if (!canvasRef.current || points.length < 3 || !originalImage) return alert("Dibuja el contorno primero");
      
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // 1. Limpiar canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // 2. Crear la máscara con los puntos dibujados
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      points.forEach(p => ctx.lineTo(p.x, p.y));
      ctx.closePath(); // Cerrar la forma
      ctx.clip(); // <--- ESTO ES EL RECORTE

      // 3. Dibujar la imagen original (solo se verá dentro del clip)
      ctx.drawImage(originalImage, 0, 0, canvas.width, canvas.height);
      ctx.restore();

      setIsCut(true); // Marcar como listo
  };

  const resetCut = () => {
      setIsCut(false); setPoints([]);
      // El useEffect se encargará de volver a pintar la imagen original
  };

  // 5. ENVIAR
  const handleSubmit = async () => {
    if (!name || !gameFinished || !canvasRef.current || !isCut) return alert("¡Completa todos los pasos!");
    setLoading(true);
    try {
      const finalImage = canvasRef.current.toDataURL('image/png');
      const waitingRef = ref(db, 'waiting_room');
      const newCarRef = push(waitingRef);
      const newId = newCarRef.key;
      setMyCarId(newId);

      await set(newCarRef, {
        id: newId,
        name: name.toUpperCase().substring(0, 12),
        level: '1',
        clicks: clicks,
        image: finalImage,
        timestamp: Date.now()
      });
    } catch (error) { console.error(error); setLoading(false); }
  };

  // --- VISTAS ---

  if (myCarId) {
      return (
        <div className="fixed inset-0 bg-neutral-900 z-50 flex flex-col items-center justify-center p-6 text-center">
            <div className="text-8xl mb-6 animate-bounce">🏎️</div>
            <h1 className="text-orange-500 font-black text-4xl mb-4">LISTO</h1>
            <p className="text-white text-xl">Tu auto recortado espera en la pista.</p>
        </div>
      );
  }

  if (gameActive) {
    return (
      <div className="fixed inset-0 bg-red-600 z-50 flex flex-col items-center justify-center touch-none select-none overflow-hidden"
           onMouseDown={handleClick} onTouchStart={handleClick}>
         <h2 className="text-yellow-300 font-black text-[12vw] animate-bounce mb-4 uppercase text-center leading-none">¡DALE!</h2>
         <div className="bg-white text-red-600 rounded-full w-[60vw] h-[60vw] flex items-center justify-center shadow-2xl active:scale-90 transition-transform">
            <span className="text-[20vw] font-black">{clicks}</span>
         </div>
         <p className="text-white mt-8 font-mono text-4xl font-bold">{timeLeft}s</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-neutral-900 flex flex-col w-full h-full font-sans">
      <div className="flex-none bg-neutral-900 p-3 text-center border-b border-gray-800 z-10">
        <h1 className="text-2xl font-black text-orange-600 italic tracking-tighter transform -skew-x-6">TALLER DE RECORTE</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5 w-full max-w-md mx-auto">
        
        {/* 1. NOMBRE */}
        <div>
          <label className="text-xs font-bold text-orange-500 uppercase ml-1 mb-1 block">1. PILOTO</label>
          <input 
            value={name} onChange={e => setName(e.target.value)}
            className="w-full p-3 bg-neutral-800 rounded-lg text-white font-bold text-lg outline-none border-2 border-transparent focus:border-orange-600"
            placeholder="Tu nombre" maxLength={10}
          />
        </div>

        {/* 2. RECORTE MANUAL (LAZO) */}
        <div className="flex flex-col">
          <label className="text-xs font-bold text-orange-500 uppercase ml-1 mb-1 block">2. RECORTE MANUAL ✂️</label>
          
          {!originalImage ? (
            <label className="flex h-40 flex-col items-center justify-center w-full border-2 border-neutral-700 border-dashed rounded-xl bg-neutral-800/50 active:bg-neutral-800 transition-colors">
               <span className="text-3xl mb-1">📸</span>
               <span className="text-sm text-gray-400 font-bold uppercase">Subir Foto</span>
               <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
            </label>
          ) : (
            <div className="flex flex-col gap-2 items-center">
               <p className="text-xs text-gray-400 mb-1">Dibuja con tu dedo el contorno del auto.</p>
               
               {/* CANVAS PARA DIBUJAR */}
               <div className="relative border-2 border-orange-500/50 rounded-lg overflow-hidden bg-[url('https://www.transparenttextures.com/patterns/checkerboard.png')] touch-none">
                  <canvas 
                    ref={canvasRef}
                    // Eventos Mouse (PC)
                    onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={stopDrawing} onMouseLeave={stopDrawing}
                    // Eventos Touch (Móvil)
                    onTouchStart={startDrawing} onTouchMove={draw} onTouchEnd={stopDrawing}
                    className={`touch-none ${isCut ? 'cursor-default' : 'cursor-crosshair'}`}
                  />
               </div>

               {/* BOTONES DE ACCIÓN */}
               <div className="flex gap-2 w-full mt-2">
                   {!isCut ? (
                     <button onClick={applyCut} className="flex-1 py-2 bg-orange-600 text-white font-bold rounded-lg shadow-lg active:scale-95">
                        ✂️ RECORTAR AHORA
                     </button>
                   ) : (
                     <div className="flex-1 py-2 bg-green-600 text-white font-bold rounded-lg text-center shadow-lg">
                        ✅ RECORTE LISTO
                     </div>
                   )}
                   <button onClick={resetCut} className="px-4 py-2 bg-neutral-700 text-white font-bold rounded-lg active:bg-neutral-600">↺ Deshacer</button>
                   <button onClick={() => setOriginalImage(null)} className="px-4 py-2 bg-red-900/50 text-red-200 rounded-lg font-bold">🗑️</button>
               </div>
            </div>
          )}
        </div>

        {/* 3. MOTOR */}
        <div className="pb-20">
           <label className="text-xs font-bold text-orange-500 uppercase ml-1 mb-1 block">3. MOTOR</label>
           {!gameFinished ? (
               <button onClick={startGame} className="w-full py-4 bg-gradient-to-r from-purple-600 to-blue-600 rounded-xl font-black text-xl shadow-lg active:scale-95 text-white">
                  AFINAR MOTOR ⚡
               </button>
           ) : (
               <div className="w-full bg-green-900/30 border border-green-600 rounded-xl p-3 flex items-center justify-between">
                   <span className="text-green-400 text-xs font-bold uppercase">Potencia:</span>
                   <span className="text-white font-black text-2xl">{clicks} CLICKS</span>
                   <button onClick={() => { setGameFinished(false); setClicks(0); }} className="text-gray-400 text-xs underline">↺</button>
               </div>
           )}
        </div>
      </div>

      <div className="flex-none p-4 bg-neutral-900 border-t border-gray-800 z-20">
        <button onClick={handleSubmit} disabled={loading || !name || !isCut || !gameFinished}
          className={`w-full py-4 rounded-xl font-black text-xl tracking-wide shadow-lg transition-all ${loading || !name || !isCut || !gameFinished ? 'bg-neutral-800 text-gray-600' : 'bg-orange-600 text-white active:scale-[0.98]'}`}>
          {loading ? 'ENVIANDO...' : '🏁 A LA PISTA'}
        </button>
      </div>
    </div>
  );
}