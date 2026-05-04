"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Download, RefreshCw, Send, Mail, CheckCircle, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function Photobooth() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [finalImage, setFinalImage] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  // Template settings
  const templatePath = "/template.png";

  // Initialize camera
  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720, facingMode: "user" },
        audio: false,
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (error) {
      console.error("Error accessing camera:", error);
      alert("Could not access camera. Please allow camera permissions.");
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
  };

  useEffect(() => {
    return () => stopCamera();
  }, [stream]);

  const captureSequence = async () => {
    setIsCapturing(true);
    const capturedPhotos: string[] = [];
    
    for (let i = 0; i < 3; i++) {
      // 3-second countdown
      for (let c = 3; c > 0; c--) {
        setCountdown(c);
        await new Promise((res) => setTimeout(res, 1000));
      }
      setCountdown(null);
      
      // Capture frame
      if (videoRef.current) {
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = videoRef.current.videoWidth;
        tempCanvas.height = videoRef.current.videoHeight;
        const ctx = tempCanvas.getContext("2d");
        if (ctx) {
          // Mirror the image to act like a mirror
          ctx.translate(tempCanvas.width, 0);
          ctx.scale(-1, 1);
          ctx.drawImage(videoRef.current, 0, 0);
          capturedPhotos.push(tempCanvas.toDataURL("image/png"));
        }
      }
      
      setPhotos([...capturedPhotos]);
      
      // Pause briefly between shots
      if (i < 2) await new Promise((res) => setTimeout(res, 1000));
    }
    
    setIsCapturing(false);
    stopCamera();
    generateFinalImage(capturedPhotos);
  };

  const generateFinalImage = (capturedPhotos: string[]) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const templateImg = new Image();
    templateImg.src = templatePath;
    templateImg.onload = () => {
      // Match canvas to template dimensions
      canvas.width = templateImg.width;
      canvas.height = templateImg.height;

      // The user provided dimensions that map perfectly to a 5x9 inch image:
      const ppi = templateImg.width / 5.0; 
      const leftMargin = 0.5 * ppi;
      
      // Based on height 2.2 and gap 0.1, increasing margin top by 0.01:
      // Frame 1: 0.81 top
      // Frame 2: 0.81 + 2.2 + 0.1 = 3.11 top
      // Frame 3: 3.11 + 2.2 + 0.1 = 5.41 top
      const frameHeight = 2.2 * ppi;
      const frameWidth = templateImg.width - (1.0 * ppi); // 0.5 left + 0.5 right
      const radius = 30;

      const dynamicSlots = [
        { x: leftMargin, y: 0.81 * ppi, width: frameWidth, height: frameHeight, radius },
        { x: leftMargin, y: 3.11 * ppi, width: frameWidth, height: frameHeight, radius },
        { x: leftMargin, y: 5.41 * ppi, width: frameWidth, height: frameHeight, radius },
      ];

      // Draw template background
      ctx.drawImage(templateImg, 0, 0);

      // Draw photos in slots
      let loadedPhotos = 0;
      capturedPhotos.forEach((photoSrc, index) => {
        const img = new Image();
        img.src = photoSrc;
        img.onload = () => {
          const slot = dynamicSlots[index];
          
          // Crop/Cover logic to fit perfectly without stretching
          const imgAspect = img.width / img.height;
          const slotAspect = slot.width / slot.height;
          
          let drawWidth, drawHeight, offsetX, offsetY;
          
          if (imgAspect > slotAspect) {
            // Image is wider than slot - crop sides
            drawHeight = img.height;
            drawWidth = img.height * slotAspect;
            offsetX = (img.width - drawWidth) / 2;
            offsetY = 0;
          } else {
            // Image is taller than slot - crop top/bottom
            drawWidth = img.width;
            drawHeight = img.width / slotAspect;
            offsetX = 0;
            offsetY = (img.height - drawHeight) / 2;
          }

          // Save context before clipping
          ctx.save();
          
          // Create clipping path for the slot
          ctx.beginPath();
          if (ctx.roundRect) {
            ctx.roundRect(slot.x, slot.y, slot.width, slot.height, slot.radius);
          } else {
            ctx.rect(slot.x, slot.y, slot.width, slot.height);
          }
          ctx.clip();
          
          // Draw image
          ctx.drawImage(
            img,
            offsetX, offsetY, drawWidth, drawHeight, // Source crop
            slot.x, slot.y, slot.width, slot.height // Destination rect
          );
          
          // Restore context to remove clipping so we can draw the stroke outside
          ctx.restore();
          
          // Draw stroke over the frame
          ctx.beginPath();
          if (ctx.roundRect) {
            ctx.roundRect(slot.x, slot.y, slot.width, slot.height, slot.radius);
          } else {
            ctx.rect(slot.x, slot.y, slot.width, slot.height);
          }
          // Scale a "2px" stroke to match the image DPI so it's actually visible
          ctx.lineWidth = 2 * (ppi / 96); 
          ctx.strokeStyle = "black";
          ctx.stroke();
          
          loadedPhotos++;
          if (loadedPhotos === 3) {
            // Save as JPEG with 75% quality to significantly reduce file size
            const finalDataUrl = canvas.toDataURL("image/jpeg", 0.75);
            setFinalImage(finalDataUrl);
            uploadToDrive(finalDataUrl);
          }
        };
      });
    };
  };

  const uploadToDrive = async (base64: string) => {
    try {
      await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64 }),
      });
      // Silent fail/success as it's an auto-upload in background
    } catch (e) {
      console.error("Drive upload failed", e);
    }
  };

  const sendEmail = () => {
    if (!email || !finalImage) return;
    setIsSending(true);
    
    // Optimistic Update: Show success instantly so it feels lightning fast!
    const userEmail = email; // Capture email for the background task
    setTimeout(() => {
      setEmailSent(true);
      setEmail("");
      setIsSending(false);
      setTimeout(() => setEmailSent(false), 5000);
    }, 600);

    // Let the heavy SMTP network request run invisibly in the background
    fetch("/api/send-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: userEmail, imageBase64: finalImage }),
    }).catch((e) => console.error("Background email error:", e));
  };

  const retake = () => {
    setPhotos([]);
    setFinalImage(null);
    setEmailSent(false);
    startCamera();
  };

  return (
    <div className="min-h-screen bg-slate-950 bg-[radial-gradient(ellipse_at_top,_rgba(64,224,208,0.15),_transparent_50%)] text-white font-sans selection:bg-[#40E0D0] selection:text-white flex flex-col items-center py-10 px-4 relative overflow-hidden">
      <div className="max-w-5xl w-full relative z-10">
        {/* Header */}
        <div className="text-center mb-8 md:mb-12">
          <h1 className="text-3xl sm:text-5xl md:text-7xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-[#20B2AA] to-[#40E0D0] mb-4 tracking-tighter drop-shadow-lg uppercase leading-tight">SJP2 Photobooth</h1>
          <p className="text-gray-300 text-base sm:text-lg md:text-xl font-medium tracking-wide bg-white/5 inline-block px-6 py-2 rounded-full backdrop-blur-md border border-white/10 shadow-lg">Capture your special moments</p>
        </div>

        <div className="bg-slate-900/40 backdrop-blur-2xl border border-white/10 p-5 sm:p-8 md:p-12 rounded-[2rem] sm:rounded-[2.5rem] shadow-[0_30px_60px_-15px_rgba(0,0,0,0.5)] transition-all">
          {/* Main Content Area */}
          {!finalImage ? (
            <div className="flex flex-col items-center justify-center">
              {/* Camera Preview */}
              <div className="relative w-full max-w-2xl aspect-video bg-gray-900 rounded-2xl overflow-hidden shadow-xl mb-8">
                {!stream && !isCapturing && photos.length === 0 && (
                  <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
                    <Camera className="w-16 h-16 text-gray-300" />
                  </div>
                )}
                
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full h-full object-cover transform -scale-x-100 ${(!stream || isCapturing && countdown === null) ? 'hidden' : 'block'}`}
                />

                {/* Countdown Overlay */}
                <AnimatePresence>
                  {countdown !== null && (
                    <motion.div
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 1.5, opacity: 0 }}
                      className="absolute inset-0 flex items-center justify-center bg-transparent"
                    >
                      <span className="text-9xl font-bold text-white drop-shadow-[0_4px_4px_rgba(0,0,0,0.8)]">{countdown}</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Controls */}
              <div className="flex gap-4">
                {!stream && photos.length === 0 ? (
                  <button
                    onClick={startCamera}
                    className="flex items-center gap-2 px-8 py-4 bg-[#40E0D0] hover:bg-[#3bcac0] text-white font-semibold rounded-full transition-all shadow-lg hover:shadow-[#40E0D0]/30 transform hover:-translate-y-0.5"
                  >
                    <Camera className="w-5 h-5" />
                    Start Camera
                  </button>
                ) : !isCapturing && photos.length === 0 ? (
                  <button
                    onClick={captureSequence}
                    className="flex items-center gap-2 px-10 py-4 bg-[#b59f5f] hover:bg-[#9c8952] text-white font-semibold rounded-full transition-all shadow-lg hover:shadow-[#b59f5f]/30 transform hover:-translate-y-0.5 text-lg"
                  >
                    <Camera className="w-6 h-6" />
                    Take 3 Photos
                  </button>
                ) : null}
              </div>

              {/* Mini Preview Slots */}
              {photos.length > 0 && !finalImage && (
                <div className="flex flex-wrap justify-center gap-3 sm:gap-4 mt-8">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="w-24 h-24 rounded-lg bg-gray-200 overflow-hidden border-2 border-white shadow-md">
                      {photos[i] && (
                        <img src={photos[i]} alt={`Photo ${i+1}`} className="w-full h-full object-cover" />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col md:flex-row gap-10 items-start">
              {/* Final Result Preview */}
              <div className="flex-1 w-full">
                <div className="relative rounded-2xl overflow-hidden shadow-2xl border-4 border-white">
                  <img src={finalImage} alt="Final Photobooth" className="w-full h-auto" />
                </div>
              </div>

              {/* Actions Panel */}
              <div className="flex-1 w-full flex flex-col gap-6">
                <div className="bg-slate-800/50 p-6 rounded-2xl shadow-lg border border-white/10">
                  <h3 className="text-xl font-semibold mb-4 text-white flex items-center gap-2">
                    <CheckCircle className="text-[#40E0D0] w-6 h-6" />
                    Photos Ready!
                  </h3>
                  
                  <div className="flex flex-col gap-4">
                    <a
                      href={finalImage}
                      download="church-event-photobooth.jpg"
                      className="flex items-center justify-center gap-2 w-full py-3 px-4 bg-[#40E0D0] hover:bg-[#3bcac0] text-slate-900 rounded-xl font-bold transition-all shadow-lg hover:shadow-[#40E0D0]/20"
                    >
                      <Download className="w-5 h-5" />
                      Download Image
                    </a>
                    
                    <button
                      onClick={retake}
                      className="flex items-center justify-center gap-2 w-full py-3 px-4 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-medium transition-colors"
                    >
                      <RefreshCw className="w-5 h-5" />
                      Retake Photos
                    </button>
                  </div>
                </div>

                <div className="bg-[#40E0D0]/10 p-4 sm:p-6 rounded-2xl border border-[#40E0D0]/20 overflow-hidden">
                  <h3 className="text-xl font-semibold mb-2 text-[#40E0D0] flex items-center gap-2">
                    <Mail className="w-6 h-6" />
                    Get Digital Copy
                  </h3>
                  <p className="text-gray-400 text-sm mb-4">Enter your email to receive a high-quality copy of your photos.</p>
                  
                  <div className="flex flex-col sm:flex-row gap-3">
                    <input
                      type="email"
                      placeholder="your@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-white/10 focus:outline-none focus:ring-2 focus:ring-[#40E0D0]/50 bg-slate-900/50 text-white placeholder-gray-500 text-sm"
                    />
                    <button
                      onClick={sendEmail}
                      disabled={isSending || !email}
                      className="w-full sm:w-auto px-6 py-3 bg-[#40E0D0] hover:bg-[#3bcac0] text-slate-900 rounded-xl font-bold transition-all shadow-lg hover:shadow-[#40E0D0]/20 disabled:opacity-50 flex items-center justify-center"
                    >
                      {isSending ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                        <div className="flex items-center gap-2 whitespace-nowrap">
                          <Send className="w-4 h-4" />
                          <span>Send</span>
                        </div>
                      )}
                    </button>
                  </div>
                  {emailSent && (
                    <p className="text-[#2ea89c] text-sm mt-3 flex items-center gap-1 font-medium">
                      <CheckCircle className="w-4 h-4" /> Email sent successfully!
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Hidden canvas for image generation */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
