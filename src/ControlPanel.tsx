import { useState, useEffect, useRef } from 'react';
import { db } from './firebase';
import { ref, push, set, onValue } from 'firebase/database';

export default function ControlPanel() {
  // --- ESTADOS GENERALES ---
  const [myCarId, setMyCarId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  // --- ESTADOS DE EDICIÓN (HERRAMIENTA LAZO) ---
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [originalImage, setOriginalImage] = useState<HTMLImageElement | null>(null);
  const [points, setPoints] = useState<{x: number, y: number}[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isCut, setIsCut] = useState(false);

  // --- ESTADOS MINIJUEGO ---
  const [gameActive, setGameActive] = useState(false);
  const [timeLeft, setTimeLeft] = useState(5);
  const [clicks, setClicks] = useState(0);
  const [gameFinished, setGameFinished] = useState(false);

  // --- LOGICA: ESCUCHAR FIN DE CARRERA ---
  useEffect(() => {
    if (!myCarId) return;
    const activeRaceRef = ref(db, 'active_race');
    const unsubscribe = onValue(activeRaceRef, (snapshot) => {
      if (!snapshot.exists()) {
          setTimeout(() => resetForm(), 4000);
      }
    });
    return () => unsubscribe();
  }, [myCarId]);

  const resetForm = () => {
    setMyCarId(null); setName(''); setOriginalImage(null);
    setIsCut(false); setPoints([]); setLoading(false);
    setClicks(0); setGameFinished(false); setTimeLeft(5);
  };

  // --- LOGICA MINIJUEGO ---
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

  // ==========================================
  //  LOGICA DE IMAGEN Y HERRAMIENTA LAZO ✂️
  // ==========================================
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
            setOriginalImage(img);
            resetCutState();
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(e.target.files[0]);
    }
  };

  const resetCutState = () => {
      setIsCut(false);
      setPoints([]);
      setIsDrawing(false);
  };

  // Dibujar imagen y trazos
  useEffect(() => {
    if (originalImage && canvasRef.current && !isCut) {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const displayWidth = 300; // Ancho fijo seguro para móviles
        const scale = displayWidth / originalImage.width;
        canvas.width = displayWidth;
        canvas.height = originalImage.height * scale;

        // 1. Dibujar imagen
        ctx.drawImage(originalImage, 0, 0, canvas.width, canvas.height);
        
        // 2. Dibujar línea roja si hay puntos
        if (points.length > 0) {
            ctx.beginPath();
            ctx.strokeStyle = '#FF4500';
            ctx.lineWidth = 3;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.moveTo(points[0].x, points[0].y);
            points.forEach(p => ctx.lineTo(p.x, p.y));
            ctx.stroke();
        }
    }
  }, [originalImage, isCut, points]);

  // --- COORDENADAS ---
  const getCoords = (e: any) => {
      const canvas = canvasRef.current;
      if (!canvas) return {x:0, y:0};
      const rect = canvas.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      return {
          x: clientX - rect.left,
          y: clientY - rect.top
      };
  };

  // --- EVENTOS DE DIBUJO ---
  const startDrawing = (e: any) => {
      if (isCut || !originalImage) return;
      if (e.cancelable && e.type === 'touchstart') e.preventDefault();
      setIsDrawing(true);
      setPoints([getCoords(e)]);
  };

  const drawMove = (e: any) => {
      if (!isDrawing || isCut) return;
      if (e.cancelable && e.type === 'touchmove') e.preventDefault();
      const newPoint = getCoords(e);
      setPoints(prev => [...prev, newPoint]);
  };

  const stopDrawing = () => {
      setIsDrawing(false);
  };

  // --- APLICAR RECORTE ---
  const applyCut = () => {
      if (!canvasRef.current || points.length < 3 || !originalImage) return alert("Dibuja un contorno cerrado primero.");
      
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // 1. Limpiar
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // 2. Crear máscara (Clip)
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      points.forEach(p => ctx.lineTo(p.x, p.y));
      ctx.closePath();
      ctx.clip(); // Recortar

      // 3. Dibujar imagen dentro del clip
      ctx.drawImage(originalImage, 0, 0, canvas.width, canvas.height);
      ctx.restore();

      setIsCut(true);
  };

  // 5. ENVIAR
  const handleSubmit = async () => {
    if (!name) return alert("Falta el nombre");
    if (!isCut) return alert("Recorta la imagen primero");
    if (!gameFinished) return alert("Termina el minijuego de motor");
    if (!canvasRef.current) return;

    setLoading(true);
    try {
      const finalImageBase64 = canvasRef.current.toDataURL('image/png');
      const waitingRef = ref(db, 'waiting_room');
      const newCarRef = push(waitingRef);
      const newId = newCarRef.key;
      setMyCarId(newId);

      await set(newCarRef, {
        id: newId,
        name: name.toUpperCase().substring(0, 12),
        level: '1',
        clicks: clicks,
        image: finalImageBase64,
        timestamp: Date.now()
      });
    } catch (error) { 
        console.error(error); 
        setLoading(false);
        alert("Error al enviar.");
    }
  };

  // ==========================================
  //  VISTAS
  // ==========================================

  if (myCarId) {
      return (
        <div className="fixed inset-0 bg-neutral-900 z-50 flex flex-col items-center justify-center p-6 text-center">
            <div className="text-8xl mb-6 animate-bounce">🏎️</div>
            <h1 className="text-orange-500 font-black text-4xl mb-4">¡ENVIADO!</h1>
            <p className="text-white text-xl">Mira la pantalla grande.</p>
        </div>
      );
  }

  if (gameActive) {
    return (
      <div className="fixed inset-0 bg-red-600 z-50 flex flex-col items-center justify-center touch-none select-none overflow-hidden"
           onMouseDown={handleClick} onTouchStart={handleClick}>
         <h2 className="text-yellow-300 font-black text-[12vw] animate-bounce mb-4 uppercase text-center leading-none">¡DALE GAS!</h2>
         <div className="bg-white text-red-600 rounded-full w-[60vw] h-[60vw] max-w-[250px] max-h-[250px] flex items-center justify-center shadow-2xl active:scale-90 transition-transform border-4 border-red-800">
            <span className="text-[20vw] font-black leading-none">{clicks}</span>
         </div>
         <p className="text-white mt-8 font-mono text-5xl font-black">{timeLeft}s</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-neutral-900 flex flex-col w-full h-full font-sans">
      <div className="flex-none bg-neutral-900 p-3 text-center border-b border-gray-800 z-10 shadow-md">
        <h1 className="text-2xl font-black text-orange-600 italic tracking-tighter transform -skew-x-6">TALLER RACING</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6 w-full max-w-md mx-auto">
        
        {/* PASO 1: NOMBRE */}
        <div className="bg-neutral-800 p-3 rounded-xl border border-neutral-700">
          <label className="text-xs font-bold text-orange-500 uppercase ml-1 mb-1 block">1. PILOTO</label>
          <input 
            value={name} onChange={e => setName(e.target.value)}
            className="w-full p-3 bg-neutral-900 rounded-lg text-white font-bold text-lg outline-none border-2 border-transparent focus:border-orange-600 transition-colors text-center"
            placeholder="Tu nombre" maxLength={10}
          />
        </div>

        {/* PASO 2: FOTO Y RECORTE */}
        <div className="bg-neutral-800 p-3 rounded-xl border border-neutral-700">
          <label className="text-xs font-bold text-orange-500 uppercase ml-1 mb-2 block flex justify-between items-center">
              <span>2. RECORTE (Dibuja contorno)</span>
              {isCut && <span className="text-green-500 text-[10px] bg-green-900/30 px-2 py-1 rounded">✅ Listo</span>}
          </label>
          
          {!originalImage ? (
            <label className="flex h-44 flex-col items-center justify-center w-full border-2 border-neutral-600 border-dashed rounded-xl bg-neutral-900/50 active:bg-neutral-800 transition-colors cursor-pointer">
               <span className="text-3xl mb-1">📸</span>
               <span className="text-sm text-gray-300 font-bold uppercase">Toca para subir foto</span>
               <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
            </label>
          ) : (
            <div className="flex flex-col gap-3 items-center">
               {!isCut && <p className="text-xs text-orange-300 text-center animate-pulse">👆 Dibuja con tu dedo alrededor del auto para recortarlo.</p>}
               
               {/* CANVAS */}
               <div className="relative border-2 border-orange-500/50 rounded-lg overflow-hidden bg-[url('https://www.transparenttextures.com/patterns/checkerboard.png')] touch-none">
                  <canvas 
                    ref={canvasRef}
                    // Eventos Mouse
                    onMouseDown={startDrawing} onMouseMove={drawMove} onMouseUp={stopDrawing} onMouseLeave={stopDrawing}
                    // Eventos Touch
                    onTouchStart={startDrawing} onTouchMove={drawMove} onTouchEnd={stopDrawing}
                    className={`block ${isCut ? 'cursor-default' : 'cursor-crosshair'}`}
                    style={{ touchAction: 'none' }} 
                  />
               </div>

               {/* BOTONES */}
               <div className="flex gap-2 w-full">
                   {!isCut ? (
                     <button 
                        onClick={applyCut} disabled={points.length < 10}
                        className={`flex-1 py-3 font-bold rounded-lg shadow-lg transition-all flex items-center justify-center gap-2 ${points.length < 10 ? 'bg-neutral-600 text-gray-400' : 'bg-blue-600 text-white active:scale-95'}`}>
                        ✂️ RECORTAR
                     </button>
                   ) : (
                     <button onClick={resetCutState} className="flex-1 py-3 bg-neutral-700 text-gray-300 font-bold rounded-lg active:bg-neutral-600 flex items-center justify-center gap-2">
                        ↺ Intentar de nuevo
                     </button>
                   )}
                   <button onClick={() => setOriginalImage(null)} className="px-4 py-2 bg-red-900/50 text-red-200 rounded-lg font-bold border border-red-900/30">🗑️</button>
               </div>
            </div>
          )}
        </div>

        {/* PASO 3: MOTOR */}
        <div className="bg-neutral-800 p-3 rounded-xl border border-neutral-700 pb-4">
           <label className="text-xs font-bold text-orange-500 uppercase ml-1 mb-2 block flex justify-between">
              <span>3. MOTOR</span>
              {gameFinished && <span className="text-green-500 text-[10px] bg-green-900/30 px-2 py-1 rounded">✅ Potencia Lista</span>}
           </label>

           {!gameFinished ? (
               <button onClick={startGame} className="w-full py-5 bg-gradient-to-r from-purple-700 to-blue-600 rounded-xl font-black text-xl shadow-lg active:scale-95 text-white flex flex-col items-center border-b-4 border-purple-900 active:border-0 active:translate-y-1 transition-all">
                  <span>AFINAR MOTOR ⚡</span>
                  <span className="text-xs font-normal opacity-70 mt-1">Minijuego de 5 segundos</span>
               </button>
           ) : (
               <div className="w-full bg-green-900/20 border-2 border-green-500/50 rounded-xl p-4 flex items-center justify-between">
                   <div>
                       <span className="text-green-400 text-xs font-bold uppercase block">Potencia:</span>
                       <span className="text-white font-black text-3xl tracking-tighter">{clicks} CLICKS</span>
                   </div>
                   <button onClick={() => { setGameFinished(false); setClicks(0); }} className="bg-neutral-700 p-2 rounded-full text-gray-300 active:scale-90 transition-transform">↺</button>
               </div>
           )}
        </div>
        
        <div className="h-20"></div>
      </div>

      <div className="flex-none p-4 bg-neutral-900 border-t border-gray-800 z-20 shadow-[0_-5px_15px_rgba(0,0,0,0.5)]">
        <button 
          onClick={handleSubmit} 
          disabled={loading || !name || !isCut || !gameFinished}
          className={`w-full py-4 rounded-xl font-black text-2xl tracking-wide shadow-lg transition-all border-b-4 flex items-center justify-center gap-3
            ${loading || !name || !isCut || !gameFinished 
                ? 'bg-neutral-700 text-gray-500 border-neutral-800 cursor-not-allowed' 
                : 'bg-gradient-to-r from-orange-500 to-red-600 text-white border-red-800 active:border-0 active:translate-y-1 active:scale-[0.99]'}`
          }>
          {loading ? 'ENVIANDO...' : '🏁 IR A LA PISTA'}
        </button>
      </div>
    </div>
  );
}