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
  // Guardamos la imagen original cargada para poder resetear
  const [originalImage, setOriginalImage] = useState<HTMLImageElement | null>(null);
  // Puntos que dibuja el usuario {x, y}
  const [points, setPoints] = useState<{x: number, y: number}[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  // Estado para saber si ya se aplicó el recorte
  const [isCut, setIsCut] = useState(false);

  // --- ESTADOS MINIJUEGO ---
  const [gameActive, setGameActive] = useState(false);
  const [timeLeft, setTimeLeft] = useState(5);
  const [clicks, setClicks] = useState(0);
  const [gameFinished, setGameFinished] = useState(false);

  // --- LOGICA: ESCUCHAR FIN DE CARRERA ---
  useEffect(() => {
    if (!myCarId) return;
    // Si ya envié mi auto, escucho si la carrera sigue activa
    const activeRaceRef = ref(db, 'active_race');
    const unsubscribe = onValue(activeRaceRef, (snapshot) => {
      // Si el snapshot no existe, significa que la carrera terminó y la borraron de Firebase
      if (!snapshot.exists()) {
          // Esperamos un poco para que vean el resultado en la pantalla grande y reseteamos
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

  // --- LOGICA MINIJUEGO (CLICKS) ---
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
  
  // 1. Cargar la imagen del input
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
            // Guardamos la imagen original en memoria
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

  // 2. Dibujar la imagen original en el canvas cada vez que cambia o se resetea
  useEffect(() => {
    if (originalImage && canvasRef.current && !isCut) {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Definimos un ancho fijo para el canvas en móviles para facilitar cálculos
        const displayWidth = 350; 
        const scale = displayWidth / originalImage.width;
        canvas.width = displayWidth;
        canvas.height = originalImage.height * scale;

        // Dibujamos la imagen limpia
        ctx.drawImage(originalImage, 0, 0, canvas.width, canvas.height);
        
        // Si hay puntos dibujados (pero aún no recortados), dibujamos la línea guía
        if (points.length > 0) {
            drawGuideLine(ctx);
        }
    }
  }, [originalImage, isCut, points]); // Se ejecuta si cambian los puntos para redibujar la línea

  // Función auxiliar para dibujar la línea roja guía
  const drawGuideLine = (ctx: CanvasRenderingContext2D) => {
      ctx.beginPath();
      ctx.strokeStyle = '#FF4500'; // Naranja brillante
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.moveTo(points[0].x, points[0].y);
      points.forEach(p => ctx.lineTo(p.x, p.y));
      ctx.stroke();
  };

  // --- FUNCIONES PARA OBTENER COORDENADAS (TOUCH Y MOUSE) ---
  const getCoords = (e: any) => {
      const canvas = canvasRef.current;
      if (!canvas) return {x:0, y:0};
      const rect = canvas.getBoundingClientRect();
      // Detectamos si es evento touch o mouse
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      // Calculamos la posición relativa al canvas
      return {
          x: clientX - rect.left,
          y: clientY - rect.top
      };
  };

  // --- EVENTOS DE DIBUJO ---
  const startDrawing = (e: any) => {
      if (isCut || !originalImage) return; // No dibujar si ya está recortado
      if (e.cancelable && e.type === 'touchstart') e.preventDefault(); // Evitar scroll al tocar
      setIsDrawing(true);
      setPoints([getCoords(e)]); // Empezar nuevo trazo
  };

  const drawMove = (e: any) => {
      if (!isDrawing || isCut) return;
      if (e.cancelable && e.type === 'touchmove') e.preventDefault(); // Evitar scroll al arrastrar

      const newPoint = getCoords(e);
      // Agregamos el nuevo punto. El useEffect se encargará de redibujar el canvas con la nueva línea.
      setPoints(prev => [...prev, newPoint]);
  };

  const stopDrawing = () => {
      setIsDrawing(false);
  };

  // --- APLICAR EL RECORTE (CLIPPING MASK) ---
  const applyCut = () => {
      if (!canvasRef.current || points.length < 3 || !originalImage) return alert("Dibuja un contorno cerrado primero.");
      
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // 1. Limpiar el canvas por completo
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // 2. Definir la ruta de recorte (el lazo que dibujó el usuario)
      ctx.save(); // Guardamos el estado actual
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      points.forEach(p => ctx.lineTo(p.x, p.y));
      ctx.closePath(); // Cerramos el camino automáticamente del último al primer punto
      
      // 3. ¡La magia! clip() hace que solo se pueda dibujar DENTRO de la ruta definida arriba
      ctx.clip(); 

      // 4. Dibujamos la imagen original. Solo aparecerá lo que esté dentro del clip.
      ctx.drawImage(originalImage, 0, 0, canvas.width, canvas.height);
      
      // 5. Restauramos el estado para futuros dibujos
      ctx.restore();

      setIsCut(true); // Marcamos como finalizado para bloquear el dibujo
  };


  // 5. ENVIAR DATOS A FIREBASE
  const handleSubmit = async () => {
    // Validaciones
    if (!name) return alert("Falta el nombre del piloto");
    if (!isCut) return alert("Debes recortar la imagen primero");
    if (!gameFinished) return alert("Debes terminar el minijuego de motor");
    if (!canvasRef.current) return;

    setLoading(true);
    try {
      // Obtenemos la imagen final ya recortada del canvas
      const finalImageBase64 = canvasRef.current.toDataURL('image/png');
      
      const waitingRef = ref(db, 'waiting_room');
      const newCarRef = push(waitingRef);
      const newId = newCarRef.key;
      setMyCarId(newId);

      await set(newCarRef, {
        id: newId,
        name: name.toUpperCase().substring(0, 12),
        level: '1', // Nivel base
        clicks: clicks, // Potencia lograda
        image: finalImageBase64,
        timestamp: Date.now()
      });
    } catch (error) { 
        console.error(error); 
        setLoading(false);
        alert("Error al enviar. Intenta de nuevo.");
    }
  };

  // ==========================================
  //  VISTAS DEL COMPONENTE
  // ==========================================

  // VISTA 1: ESPERA (Ya envié mi auto)
  if (myCarId) {
      return (
        <div className="fixed inset-0 bg-neutral-900 z-50 flex flex-col items-center justify-center p-6 text-center">
            <div className="text-8xl mb-6 animate-bounce">🏎️</div>
            <h1 className="text-orange-500 font-black text-4xl mb-4">¡AUTO ENVIADO!</h1>
            <p className="text-white text-xl px-4">Mira la pantalla grande, tu auto aparecerá pronto.</p>
            <p className="text-gray-500 text-sm mt-8 animate-pulse">No cierres esta ventana.</p>
        </div>
      );
  }

  // VISTA 2: MINIJUEGO ACTIVO (Pantalla Roja)
  if (gameActive) {
    return (
      <div className="fixed inset-0 bg-red-600 z-50 flex flex-col items-center justify-center touch-none select-none overflow-hidden"
           onMouseDown={handleClick} onTouchStart={handleClick}>
         <h2 className="text-yellow-300 font-black text-[12vw] animate-bounce mb-4 uppercase text-center leading-none">¡DALE GAS!</h2>
         <p className="text-white mb-4 font-bold uppercase">Toca la pantalla rápido</p>
         <div className="bg-white text-red-600 rounded-full w-[50vw] h-[50vw] max-w-[250px] max-h-[250px] flex items-center justify-center shadow-2xl active:scale-90 transition-transform border-4 border-red-800">
            <span className="text-[20vw] font-black leading-none">{clicks}</span>
         </div>
         <p className="text-white mt-8 font-mono text-5xl font-black">{timeLeft}s</p>
      </div>
    );
  }

  // VISTA 3: FORMULARIO PRINCIPAL
  return (
    <div className="fixed inset-0 bg-neutral-900 flex flex-col w-full h-full font-sans">
      {/* HEADER */}
      <div className="flex-none bg-neutral-900 p-3 text-center border-b border-gray-800 z-10 shadow-md">
        <h1 className="text-2xl font-black text-orange-600 italic tracking-tighter transform -skew-x-6">TALLER RACING</h1>
      </div>

      {/* CONTENIDO SCROLLEABLE */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6 w-full max-w-md mx-auto">
        
        {/* PASO 1: NOMBRE */}
        <div className="bg-neutral-800 p-3 rounded-xl border border-neutral-700">
          <label className="text-xs font-bold text-orange-500 uppercase ml-1 mb-1 block">1. PILOTO</label>
          <input 
            value={name} onChange={e => setName(e.target.value)}
            className="w-full p-3 bg-neutral-900 rounded-lg text-white font-bold text-lg outline-none border-2 border-transparent focus:border-orange-600 transition-colors text-center"
            placeholder="Tu nombre corto" maxLength={10}
          />
        </div>

        {/* PASO 2: FOTO Y RECORTE LAZO */}
        <div className="bg-neutral-800 p-3 rounded-xl border border-neutral-700">
          <label className="text-xs font-bold text-orange-500 uppercase ml-1 mb-2 block flex justify-between items-center">
              <span>2. CARROCERÍA (Recorte)</span>
              {isCut && <span className="text-green-500 text-[10px] bg-green-900/30 px-2 py-1 rounded">✅ Listo</span>}
          </label>
          
          {!originalImage ? (
            // BOTÓN SUBIR IMAGEN
            <label className="flex h-44 flex-col items-center justify-center w-full border-2 border-neutral-600 border-dashed rounded-xl bg-neutral-900/50 active:bg-neutral-800 transition-colors cursor-pointer">
               <span className="text-4xl mb-2">📸</span>
               <span className="text-sm text-gray-300 font-bold uppercase">Toca para subir foto</span>
               <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
            </label>
          ) : (
            // ÁREA DE EDICIÓN
            <div className="flex flex-col gap-3 items-center">
               {!isCut && <p className="text-xs text-orange-300 animate-pulse text-center bg-orange-900/30 w-full py-1 rounded">👆 Dibuja con tu dedo el contorno del auto</p>}
               
               {/* CANVAS INTERACTIVO */}
               <div className="relative border-2 border-orange-500/50 rounded-lg overflow-hidden bg-[url('https://www.transparenttextures.com/patterns/checkerboard.png')] shadow-inner">
                  {/* Usamos touch-action: none para que el navegador no intente hacer scroll o zoom al dibujar */}
                  <canvas 
                    ref={canvasRef}
                    // Eventos para Mouse (PC)
                    onMouseDown={startDrawing} onMouseMove={drawMove} onMouseUp={stopDrawing} onMouseLeave={stopDrawing}
                    // Eventos para Touch (Celular)
                    onTouchStart={startDrawing} onTouchMove={drawMove} onTouchEnd={stopDrawing}
                    className={`block ${isCut ? 'cursor-default pointer-events-none' : 'cursor-crosshair'}`}
                    style={{ touchAction: 'none' }} 
                  />
               </div>

               {/* BOTONES DE ACCIÓN */}
               <div className="flex gap-2 w-full">
                   {!isCut ? (
                     // Botón Recortar
                     <button 
                        onClick={applyCut} disabled={points.length < 10}
                        className={`flex-1 py-3 font-bold rounded-lg shadow-lg transition-all flex items-center justify-center gap-2 ${points.length < 10 ? 'bg-neutral-600 text-gray-400' : 'bg-blue-600 text-white active:scale-95'}`}>
                        ✂️ RECORTAR
                     </button>
                   ) : (
                     // Estado Finalizado
                     <button onClick={resetCutState} className="flex-1 py-3 bg-neutral-700 text-gray-300 font-bold rounded-lg active:bg-neutral-600 flex items-center justify-center gap-2">
                        ↺ Intentar de nuevo
                     </button>
                   )}
                   
                   {/* Botón Borrar Todo */}
                   <button onClick={() => setOriginalImage(null)} className="px-4 bg-red-900/50 text-red-200 rounded-lg font-bold border border-red-900/30 active:bg-red-900/80">
                    🗑️
                   </button>
               </div>
            </div>
          )}
        </div>

        {/* PASO 3: MOTOR (MINIJUEGO) */}
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
               // Resultado del minijuego
               <div className="w-full bg-green-900/20 border-2 border-green-500/50 rounded-xl p-4 flex items-center justify-between">
                   <div>
                       <span className="text-green-400 text-xs font-bold uppercase block">Potencia Obtenida:</span>
                       <span className="text-white font-black text-3xl tracking-tighter">{clicks} CLICKS</span>
                   </div>
                   <button onClick={() => { setGameFinished(false); setClicks(0); }} className="bg-neutral-700 p-2 rounded-full text-gray-300 active:scale-90 transition-transform">
                      ↺
                   </button>
               </div>
           )}
        </div>
        
        {/* Espacio extra al final para el scroll */}
        <div className="h-20"></div>
      </div>

      {/* FOOTER FIJO: BOTÓN ENVIAR */}
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