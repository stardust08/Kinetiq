import React, { useState, useEffect } from "react";
import { AppRouter } from "./Router";
import { Toaster } from "./components/ui/sonner";
import { useCartInitialization } from "../hooks/useCartInitialization";
import { SplashScreen } from "../components/SplashScreen";

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [isFirstLoad, setIsFirstLoad] = useState(true);

  // Initialize cart from server on app load
  useCartInitialization();

  useEffect(() => {
    // Check if this is the first load
    const hasSeenSplash = sessionStorage.getItem('hasSeenSplash');
    
    if (hasSeenSplash) {
      setShowSplash(false);
      setIsFirstLoad(false);
    }
  }, []);

  const handleSplashComplete = () => {
    setShowSplash(false);
    sessionStorage.setItem('hasSeenSplash', 'true');
  };

  if (showSplash && isFirstLoad) {
    return <SplashScreen onComplete={handleSplashComplete} />;
  }

  return (
    <>
      <AppRouter />
      <Toaster />
    </>
  );
}