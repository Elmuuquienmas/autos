import { useState, useEffect, useRef } from 'react';
import { db } from './firebase';
import { ref, push, set, onValue } from 'firebase/database';
// IMPORTANTE: npm install @imgly/background-removal
import { removeBackground } from "@imgly/background-removal";

export default function ControlPanel() {
  // --- ESTADOS ---
  const [myCarId, setMyCarId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('');

  // ESTADOS DE EDICIÓN
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [originalImage, setOriginalImage] = useState<HTMLImageElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [points, setPoints] = useState<{x: number, y: number}[]>([]);
  const [isCut, setIsCut] = useState(false);

  // ESTADOS JUEGO
  const [gameActive, setGameActive] = useState(false);
  const [timeLeft, setTimeLeft] = useState(5);
  const [clicks, setClicks] = useState(0);
  const [gameFinished, setGameFinished] = useState(false);

  // --- ESCUCHAR ESTADO ---
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
    setIsCut(false); setPoints([]); setLoading(false); setLoadingStatus('');
    setClicks(0); setGameFinished(false); setTimeLeft(5);
  };

  // --- MINIJUEGO ---
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

  // --- IMAGEN ---
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

  useEffect(() => {
    if (originalImage && canvasRef.current && !isCut) {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        // Máximo 350px de ancho para móviles
        const displayWidth = 350; 
        const scale = displayWidth / originalImage.width;
        canvas.width = displayWidth;
        canvas.height = originalImage.height * scale;
        ctx.drawImage(originalImage, 0, 0, canvas.width, canvas.height);
    }
  }, [originalImage, isCut]);

  // --- DIBUJO MANUAL ---
  const getCoords = (e: any) => {
      const canvas = canvasRef.current;
      if (!canvas) return {x:0, y:0};
      const rect = canvas.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const startDrawing = (e: any) => {
      if (isCut || !originalImage) return;
      setIsDrawing(true);
      setPoints([getCoords(e)]);
  };

  const draw = (e: any) => {
      if (!isDrawing || isCut || !canvasRef.current || !originalImage) return;
      if(e.cancelable) e.preventDefault();

      const newPoint = getCoords(e);
      const currentPoints = [...points, newPoint];
      setPoints(currentPoints);

      const ctx = canvasRef.current.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.drawImage(originalImage, 0, 0, ctx.canvas.width, ctx.canvas.height);
      
      ctx.beginPath();
      ctx.strokeStyle = '#00ff00'; // Verde fosfo para que se vea bien
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.moveTo(currentPoints[0].x, currentPoints[0].y);
      currentPoints.forEach(p => ctx.lineTo(p.x, p.y));
      ctx.stroke();
  };

  const stopDrawing = () => setIsDrawing(false);

  // --- PROCESAMIENTO INTELIGENTE (LAZO + IA) ---
  const applySmartCut = async () => {
      if (!canvasRef.current || points.length < 10 || !originalImage) return alert("Dibuja un contorno cerrado alrededor del auto.");
      
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      setLoading(true);
      setLoadingStatus("✨ Refinando bordes con IA...");

      try {
          // 1. Primero hacemos el recorte "burdo" manual
          // Creamos un canvas temporal
          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = canvas.width;
          tempCanvas.height = canvas.height;
          const tempCtx = tempCanvas.getContext('2d');
          
          if (tempCtx) {
              // Aplicamos la máscara manual
              tempCtx.beginPath();
              tempCtx.moveTo(points[0].x, points[0].y);
              points.forEach(p => tempCtx.lineTo(p.x, p.y));
              tempCtx.closePath();
              tempCtx.clip();
              tempCtx.drawImage(originalImage, 0, 0, canvas.width, canvas.height);
              
              // 2. Convertimos ese recorte burdo a Blob
              const roughBlob = await new Promise<Blob | null>(r => tempCanvas.toBlob(r, 'image/png'));
              
              if (roughBlob) {
                  // 3. Pasamos el recorte burdo a la IA para que limpie los bordes
                  // Usamos CDN público para evitar errores de configuración local
                  const config = {
                      publicPath: "https://static.imgly.com/lib/background-removal-data/"
                  };
                  
                  const imageBlob = await removeBackground(roughBlob, config);
                  
                  // 4. Pintamos el resultado "Inteligente" de vuelta en el canvas principal
                  const cleanImage = new Image();
                  cleanImage.src = URL.createObjectURL(imageBlob);
                  cleanImage.onload = () => {
                      ctx.clearRect(0, 0, canvas.width, canvas.height);
                      ctx.drawImage(cleanImage, 0, 0, canvas.width, canvas.height);
                      setIsCut(true);
                      setLoading(false);
                      setLoadingStatus("");
                  };
              }
          }
      } catch (error) {
          console.error("Error IA:", error);
          alert("La IA falló, usando recorte manual.");
          // Fallback: Dejar el recorte manual si la IA falla
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(points[0].x, points[0].y);
          points.forEach(p => ctx.lineTo(p.x, p.y));
          ctx.closePath();
          ctx.clip();
          ctx.drawImage(originalImage, 0, 0, canvas.width, canvas.height);
          ctx.restore();
          setIsCut(true);
          setLoading(false);
      }
  };

  const resetCut = () => {
      setIsCut(false); setPoints([]);
  };

  // --- ENVIAR ---
  const handleSubmit = async () => {
    if (!name || !gameFinished || !canvasRef.current || !isCut) return alert("¡Termina los pasos!");
    setLoading(true);
    setLoadingStatus("Subiendo auto...");
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
            <p className="text-white text-xl">Tu auto está en espera.</p>
        </div>
      );
  }

  if (gameActive) {
    return (
      <div className="fixed inset-0 bg-red-600 z-50 flex flex-col items-center justify-center touch-none select-none overflow-hidden"
           onMouseDown={handleClick} onTouchStart={handleClick}>
         <h2 className="text-yellow-300 font-black text-[12vw] animate-bounce mb-4 uppercase leading-none">¡DALE!</h2>
         <div className="bg-white text-red-600 rounded-full w-[60vw] h-[60vw] flex items-center justify-center shadow-2xl active:scale-90 transition-transform border-4 border-red-800">
            <span className="text-[20vw] font-black">{clicks}</span>
         </div>
         <p className="text-white mt-8 font-mono text-4xl font-bold">{timeLeft}s</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-neutral-900 flex flex-col w-full h-full font-sans">
      <div className="flex-none bg-neutral-900 p-3 text-center border-b border-gray-800 z-10">
        <h1 className="text-2xl font-black text-orange-600 italic tracking-tighter transform -skew-x-6">TALLER HÍBRIDO</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5 w-full max-w-md mx-auto">
        
        {/* 1. NOMBRE */}
        <div className="bg-neutral-800 p-3 rounded-xl border border-neutral-700">
          <label className="text-xs font-bold text-orange-500 uppercase ml-1 mb-1 block">1. PILOTO</label>
          <input value={name} onChange={e => setName(e.target.value)} className="w-full p-3 bg-neutral-900 rounded-lg text-white font-bold text-lg outline-none border-2 border-transparent focus:border-orange-600 text-center" placeholder="Nombre" maxLength={10}/>
        </div>

        {/* 2. RECORTE INTELIGENTE */}
        <div className="bg-neutral-800 p-3 rounded-xl border border-neutral-700">
          <label className="text-xs font-bold text-orange-500 uppercase ml-1 mb-2 block flex justify-between">
              <span>2. RECORTE (Lazo + IA)</span>
              {isCut && <span className="text-green-500 text-[10px] bg-green-900/30 px-2 py-1 rounded">✅ Listo</span>}
          </label>
          
          {!originalImage ? (
            <label className="flex h-44 flex-col items-center justify-center w-full border-2 border-neutral-600 border-dashed rounded-xl bg-neutral-900/50 active:bg-neutral-800 transition-colors cursor-pointer">
               <span className="text-3xl mb-1">📸</span>
               <span className="text-sm text-gray-300 font-bold uppercase">Subir Foto</span>
               <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
            </label>
          ) : (
            <div className="flex flex-col gap-3 items-center">
               {!isCut && <p className="text-xs text-gray-400 text-center">Dibuja un círculo "más o menos" alrededor del auto.</p>}
               
               <div className="relative border-2 border-orange-500/50 rounded-lg overflow-hidden bg-[url('https://www.transparenttextures.com/patterns/checkerboard.png')] touch-none">
                  <canvas 
                    ref={canvasRef}
                    onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={stopDrawing} onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing} onTouchMove={draw} onTouchEnd={stopDrawing}
                    className={`touch-none ${isCut ? 'cursor-default' : 'cursor-crosshair'}`}
                  />
                  {loading && isDrawing === false && !isCut && (
                      <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-10">
                          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-orange-500 mb-2"></div>
                          <span className="text-xs text-orange-400 animate-pulse">{loadingStatus}</span>
                      </div>
                  )}
               </div>

               <div className="flex gap-2 w-full">
                   {!isCut ? (
                     <button onClick={applySmartCut} disabled={points.length < 10 || loading}
                        className={`flex-1 py-3 font-bold rounded-lg shadow-lg transition-all flex items-center justify-center gap-2 ${points.length < 10 ? 'bg-neutral-600 text-gray-400' : 'bg-blue-600 text-white active:scale-95'}`}>
                        ✂️ RECORTE INTELIGENTE
                     </button>
                   ) : (
                     <button onClick={resetCut} className="flex-1 py-3 bg-neutral-700 text-gray-300 font-bold rounded-lg active:bg-neutral-600">
                        ↺ Reintentar
                     </button>
                   )}
                   <button onClick={() => setOriginalImage(null)} className="px-4 py-2 bg-red-900/50 text-red-200 rounded-lg font-bold border border-red-900/30">🗑️</button>
               </div>
            </div>
          )}
        </div>

        {/* 3. MOTOR */}
        <div className="bg-neutral-800 p-3 rounded-xl border border-neutral-700 pb-4">
           <label className="text-xs font-bold text-orange-500 uppercase ml-1 mb-2 block flex justify-between">
              <span>3. MOTOR</span>
              {gameFinished && <span className="text-green-500 text-[10px] bg-green-900/30 px-2 py-1 rounded">✅ Potencia Lista</span>}
           </label>
           {!gameFinished ? (
               <button onClick={startGame} className="w-full py-5 bg-gradient-to-r from-purple-700 to-blue-600 rounded-xl font-black text-xl shadow-lg active:scale-95 text-white flex flex-col items-center">
                  <span>AFINAR MOTOR ⚡</span>
               </button>
           ) : (
               <div className="w-full bg-green-900/20 border-2 border-green-500/50 rounded-xl p-4 flex items-center justify-between">
                   <div><span className="text-green-400 text-xs font-bold uppercase block">Potencia:</span><span className="text-white font-black text-3xl">{clicks} CLICKS</span></div>
                   <button onClick={() => { setGameFinished(false); setClicks(0); }} className="bg-neutral-700 p-2 rounded-full text-gray-300">↺</button>
               </div>
           )}
        </div>
        <div className="h-20"></div>
      </div>

      <div className="flex-none p-4 bg-neutral-900 border-t border-gray-800 z-20 shadow-[0_-5px_15px_rgba(0,0,0,0.5)]">
        <button onClick={handleSubmit} disabled={loading || !name || !isCut || !gameFinished}
          className={`w-full py-4 rounded-xl font-black text-2xl tracking-wide shadow-lg transition-all ${loading || !name || !isCut || !gameFinished ? 'bg-neutral-700 text-gray-500' : 'bg-orange-600 text-white active:scale-[0.98]'}`}>
          {loading ? loadingStatus || 'ENVIANDO...' : '🏁 A LA PISTA'}
        </button>
      </div>
    </div>
  );
}