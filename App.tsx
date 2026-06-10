/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import StartScreen from './components/StartScreen';
import Canvas from './components/Canvas';
import WardrobePanel from './components/WardrobeModal';
import OutfitStack from './components/OutfitStack';
import { generateVirtualTryOnImage, generatePoseVariation } from './services/geminiService';
import { OutfitLayer, WardrobeItem } from './types';
import { ChevronDownIcon, ChevronUpIcon } from './components/icons';
import { defaultWardrobe } from './wardrobe';
import Footer from './components/Footer';
import { getFriendlyErrorMessage, urlToFile } from './lib/utils';
import Spinner from './components/Spinner';

const POSE_INSTRUCTIONS = [
  "Close-up face portrait, front-facing view, looking directly at the camera, neutral expression, no glasses",
  "Close-up face portrait, side profile 3/4 view, neutral expression, no glasses",
];

const useMediaQuery = (query: string): boolean => {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const mediaQueryList = window.matchMedia(query);
    const listener = (event: MediaQueryListEvent) => setMatches(event.matches);

    // DEPRECATED: mediaQueryList.addListener(listener);
    mediaQueryList.addEventListener('change', listener);
    
    // Check again on mount in case it changed between initial state and effect runs
    if (mediaQueryList.matches !== matches) {
      setMatches(mediaQueryList.matches);
    }

    return () => {
      // DEPRECATED: mediaQueryList.removeListener(listener);
      mediaQueryList.removeEventListener('change', listener);
    };
  }, [query, matches]);

  return matches;
};


const App: React.FC = () => {
  const [modelImageUrl, setModelImageUrl] = useState<string | null>(null);
  const [outfitHistory, setOutfitHistory] = useState<OutfitLayer[]>([]);
  const [currentOutfitIndex, setCurrentOutfitIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [currentPoseIndex, setCurrentPoseIndex] = useState(0);
  const [isSheetCollapsed, setIsSheetCollapsed] = useState(false);
  const [wardrobe, setWardrobe] = useState<WardrobeItem[]>(() => {
    try {
      const saved = localStorage.getItem('fitcheck-glasses-wardrobe');
      return saved ? JSON.parse(saved) : defaultWardrobe;
    } catch {
      return defaultWardrobe;
    }
  });
  const isMobile = useMediaQuery('(max-width: 767px)');

  useEffect(() => {
    try {
      localStorage.setItem('fitcheck-glasses-wardrobe', JSON.stringify(wardrobe));
    } catch (e) {
      console.error('Failed to save wardrobe to localStorage', e);
    }
  }, [wardrobe]);

  const activeOutfitLayers = useMemo(() => 
    outfitHistory.slice(0, currentOutfitIndex + 1), 
    [outfitHistory, currentOutfitIndex]
  );
  
  const activeGarmentIds = useMemo(() => 
    activeOutfitLayers.map(layer => layer.garment?.id).filter(Boolean) as string[], 
    [activeOutfitLayers]
  );
  
  const displayImageUrl = useMemo(() => {
    if (outfitHistory.length === 0) return modelImageUrl;
    const currentLayer = outfitHistory[currentOutfitIndex];
    if (!currentLayer) return modelImageUrl;

    const poseInstruction = POSE_INSTRUCTIONS[currentPoseIndex];
    // Return the image for the current pose, or fallback to the first available image for the current layer.
    // This ensures an image is shown even while a new pose is generating.
    return currentLayer.poseImages[poseInstruction] ?? Object.values(currentLayer.poseImages)[0];
  }, [outfitHistory, currentOutfitIndex, currentPoseIndex, modelImageUrl]);

  const availablePoseKeys = useMemo(() => {
    if (outfitHistory.length === 0) return [];
    const currentLayer = outfitHistory[currentOutfitIndex];
    return currentLayer ? Object.keys(currentLayer.poseImages) : [];
  }, [outfitHistory, currentOutfitIndex]);

  const handleModelFinalized = (url: string) => {
    setModelImageUrl(url);
    setOutfitHistory([{
      garment: null,
      poseImages: { [POSE_INSTRUCTIONS[0]]: url }
    }]);
    setCurrentOutfitIndex(0);
  };

  const handleStartOver = () => {
    setModelImageUrl(null);
    setOutfitHistory([]);
    setCurrentOutfitIndex(0);
    setIsLoading(false);
    setLoadingMessage('');
    setError(null);
    setCurrentPoseIndex(0);
    setIsSheetCollapsed(false);
  };

  const handleGarmentSelect = useCallback(async (garmentFile: File, garmentInfo: WardrobeItem) => {
    if (!displayImageUrl || isLoading) return;

    setError(null);
    setIsLoading(true);
    setLoadingMessage(`Provando ${garmentInfo.name}...`);

    try {
      const currentPoseInstruction = POSE_INSTRUCTIONS[currentPoseIndex];
      // Use the base face portrait (layer 0) as the clean backdrop background, or fallback to the current displayImageUrl
      const baseModelImage = outfitHistory[0]?.poseImages[currentPoseInstruction] || displayImageUrl;

      const newImageUrl = await generateVirtualTryOnImage(baseModelImage, garmentFile, garmentInfo.category);
      
      const newLayer: OutfitLayer = { 
        garment: garmentInfo, 
        poseImages: { [currentPoseInstruction]: newImageUrl } 
      };

      setOutfitHistory(prevHistory => {
        const baseLayer = prevHistory[0];
        // Ensure only one active layer of eyewear is ever kept at index 1
        return [baseLayer, newLayer];
      });
      setCurrentOutfitIndex(1);
      
      // Add to personal wardrobe if it's not already there
      setWardrobe(prev => {
        if (prev.find(item => item.id === garmentInfo.id)) {
            return prev;
        }
        return [...prev, garmentInfo];
      });
    } catch (err) {
      setError(getFriendlyErrorMessage(err, 'Falha ao aplicar os óculos no seu rosto.'));
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
    }
  }, [displayImageUrl, isLoading, currentPoseIndex, outfitHistory]);

  const handleRemoveLastGarment = () => {
    if (currentOutfitIndex > 0) {
      setCurrentOutfitIndex(0); // Voltar para o retrato base (sem óculos)
      setCurrentPoseIndex(0); // Reset pose to front view
    }
  };

  const handleClearCustomUploads = useCallback(() => {
    setWardrobe(defaultWardrobe);
    setOutfitHistory(prevHistory => {
      if (prevHistory.length <= 1) return prevHistory;
      return [prevHistory[0]];
    });
    setCurrentOutfitIndex(0);
    setCurrentPoseIndex(0);
  }, []);

  const handleDeleteWardrobeItem = useCallback((itemId: string) => {
    setWardrobe(prev => prev.filter(item => item.id !== itemId));
    setOutfitHistory(prevHistory => {
      const currentLayer = prevHistory[1];
      if (currentLayer && currentLayer.garment?.id === itemId) {
        setCurrentOutfitIndex(0);
        setCurrentPoseIndex(0);
        return [prevHistory[0]];
      }
      return prevHistory;
    });
  }, []);

  const handleClearAllWardrobe = useCallback(() => {
    setWardrobe([]);
    setOutfitHistory(prevHistory => {
      setCurrentOutfitIndex(0);
      setCurrentPoseIndex(0);
      return [prevHistory[0]];
    });
  }, []);

  const handleRestoreDefaults = useCallback(() => {
    setWardrobe(defaultWardrobe);
  }, []);
  
  const handlePoseSelect = useCallback(async (newIndex: number) => {
    if (isLoading || outfitHistory.length === 0 || newIndex === currentPoseIndex) return;
    
    const poseInstruction = POSE_INSTRUCTIONS[newIndex];
    const currentLayer = outfitHistory[currentOutfitIndex];

    // If pose already exists, just update the index to show it.
    if (currentLayer.poseImages[poseInstruction]) {
      setCurrentPoseIndex(newIndex);
      return;
    }

    setError(null);
    setIsLoading(true);
    setLoadingMessage(`Alterando o ângulo do rosto...`);
    
    const prevPoseIndex = currentPoseIndex;
    // Optimistically update the pose index so the pose name changes in the UI
    setCurrentPoseIndex(newIndex);

    try {
      if (currentOutfitIndex === 1 && currentLayer.garment) {
        // We have active glasses.
        // Step 1: Ensure that the BASE model has the target pose image.
        let baseModelPoseUrl = outfitHistory[0]?.poseImages[poseInstruction];
        if (!baseModelPoseUrl) {
          const frontBaseUrl = outfitHistory[0]?.poseImages[POSE_INSTRUCTIONS[0]];
          if (!frontBaseUrl) {
            throw new Error('Modelo base não encontrado.');
          }
          // Generate the base face portrait without glasses for the new pose
          baseModelPoseUrl = await generatePoseVariation(frontBaseUrl, poseInstruction);
          
          // Save the generated base model pose back into layer 0
          setOutfitHistory(prev => {
            const next = [...prev];
            if (next[0]) {
              next[0] = {
                ...next[0],
                poseImages: {
                  ...next[0].poseImages,
                  [poseInstruction]: baseModelPoseUrl!
                }
              };
            }
            return next;
          });
        }

        // Step 2: Overlay the active glasses onto this brand new base model pose
        const garmentInfo = currentLayer.garment;
        const garmentFile = await urlToFile(garmentInfo.url, garmentInfo.name);
        const newImageUrl = await generateVirtualTryOnImage(baseModelPoseUrl, garmentFile, garmentInfo.category);

        // Step 3: Save the resulting glasses image to layer 1 for this pose
        setOutfitHistory(prev => {
          const next = [...prev];
          if (next[1]) {
            next[1] = {
              ...next[1],
              poseImages: {
                ...next[1].poseImages,
                [poseInstruction]: newImageUrl
              }
            };
          }
          return next;
        });

      } else {
        // We are on the base model layer (no glasses).
        const baseImageForPoseChange = outfitHistory[0]?.poseImages[POSE_INSTRUCTIONS[0]];
        if (!baseImageForPoseChange) {
          throw new Error('Retrato base não encontrado.');
        }

        const newImageUrl = await generatePoseVariation(baseImageForPoseChange, poseInstruction);
        setOutfitHistory(prevHistory => {
          const newHistory = [...prevHistory];
          if (newHistory[0]) {
            newHistory[0] = {
              ...newHistory[0],
              poseImages: {
                ...newHistory[0].poseImages,
                [poseInstruction]: newImageUrl
              }
            };
          }
          return newHistory;
        });
      }
    } catch (err) {
      setError(getFriendlyErrorMessage(err, 'Falha ao alterar o ângulo de exibição.'));
      // Revert pose index on failure
      setCurrentPoseIndex(prevPoseIndex);
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
    }
  }, [currentPoseIndex, outfitHistory, isLoading, currentOutfitIndex]);

  const viewVariants = {
    initial: { opacity: 0, y: 15 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -15 },
  };

  return (
    <div className="font-sans">
      <AnimatePresence mode="wait">
        {!modelImageUrl ? (
          <motion.div
            key="start-screen"
            className="w-screen min-h-screen flex items-start sm:items-center justify-center bg-gray-50 p-4 pb-20"
            variants={viewVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.5, ease: 'easeInOut' }}
          >
            <StartScreen onModelFinalized={handleModelFinalized} />
          </motion.div>
        ) : (
          <motion.div
            key="main-app"
            className="relative flex flex-col h-screen bg-white overflow-hidden"
            variants={viewVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.5, ease: 'easeInOut' }}
          >
            <main className="flex-grow relative flex flex-col md:flex-row overflow-hidden">
              <div className="w-full h-full flex-grow flex items-center justify-center bg-white pb-16 relative">
                <Canvas 
                  displayImageUrl={displayImageUrl}
                  onStartOver={handleStartOver}
                  isLoading={isLoading}
                  loadingMessage={loadingMessage}
                  onSelectPose={handlePoseSelect}
                  poseInstructions={POSE_INSTRUCTIONS}
                  currentPoseIndex={currentPoseIndex}
                  availablePoseKeys={availablePoseKeys}
                />
              </div>

              <aside 
                className={`absolute md:relative md:flex-shrink-0 bottom-0 right-0 h-auto md:h-full w-full md:w-1/3 md:max-w-sm bg-white/80 backdrop-blur-md flex flex-col border-t md:border-t-0 md:border-l border-gray-200/60 transition-transform duration-500 ease-in-out ${isSheetCollapsed ? 'translate-y-[calc(100%-4.5rem)]' : 'translate-y-0'} md:translate-y-0`}
                style={{ transitionProperty: 'transform' }}
              >
                  <button 
                    onClick={() => setIsSheetCollapsed(!isSheetCollapsed)} 
                    className="md:hidden w-full h-8 flex items-center justify-center bg-gray-100/50"
                    aria-label={isSheetCollapsed ? 'Expand panel' : 'Collapse panel'}
                  >
                    {isSheetCollapsed ? <ChevronUpIcon className="w-6 h-6 text-gray-500" /> : <ChevronDownIcon className="w-6 h-6 text-gray-500" />}
                  </button>
                  <div className="p-4 md:p-6 pb-20 overflow-y-auto flex-grow flex flex-col gap-8">
                    {error && (
                      <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4 rounded-md" role="alert">
                        <p className="font-bold">Error</p>
                        <p>{error}</p>
                      </div>
                    )}
                    <OutfitStack 
                      outfitHistory={activeOutfitLayers}
                      onRemoveLastGarment={handleRemoveLastGarment}
                    />
                    <WardrobePanel
                      onGarmentSelect={handleGarmentSelect}
                      activeGarmentIds={activeGarmentIds}
                      isLoading={isLoading}
                      wardrobe={wardrobe}
                      onClearCustomUploads={handleClearCustomUploads}
                      onDeleteItem={handleDeleteWardrobeItem}
                      onClearAll={handleClearAllWardrobe}
                      onRestoreDefaults={handleRestoreDefaults}
                    />
                  </div>
              </aside>
            </main>
            <AnimatePresence>
              {isLoading && isMobile && (
                <motion.div
                  className="fixed inset-0 bg-white/80 backdrop-blur-md flex flex-col items-center justify-center z-50"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <Spinner />
                  {loadingMessage && (
                    <p className="text-lg font-serif text-gray-700 mt-4 text-center px-4">{loadingMessage}</p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
      <Footer isOnDressingScreen={!!modelImageUrl} />
    </div>
  );
};

export default App;