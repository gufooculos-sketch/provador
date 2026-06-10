/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useState } from 'react';
import type { WardrobeItem } from '../types';
import { UploadCloudIcon, CheckCircleIcon, HeartIcon, Trash2Icon } from './icons';
import { urlToFile } from '../lib/utils';

interface WardrobePanelProps {
  onGarmentSelect: (garmentFile: File, garmentInfo: WardrobeItem) => void;
  activeGarmentIds: string[];
  isLoading: boolean;
  wardrobe: WardrobeItem[];
  onClearCustomUploads: () => void;
  onDeleteItem: (itemId: string) => void;
  onClearAll: () => void;
  onRestoreDefaults: () => void;
}

const WardrobePanel: React.FC<WardrobePanelProps> = ({ 
  onGarmentSelect, 
  activeGarmentIds, 
  isLoading, 
  wardrobe, 
  onClearCustomUploads,
  onDeleteItem,
  onClearAll,
  onRestoreDefaults
}) => {
    const [error, setError] = useState<string | null>(null);
    const [showOnlyFavorites, setShowOnlyFavorites] = useState(false);
    const [favorites, setFavorites] = useState<string[]>(() => {
        try {
            const saved = localStorage.getItem('fitcheck-glasses-favorites');
            return saved ? JSON.parse(saved) : [];
        } catch {
            return [];
        }
    });

    const handleClearAllGlasses = () => {
        setFavorites([]);
        try {
            localStorage.removeItem('fitcheck-glasses-favorites');
        } catch (e) {
            console.error('Failed to clear favorites from localStorage', e);
        }
        onClearAll();
    };

    const handleRestoreDefaultGlasses = () => {
        onRestoreDefaults();
    };

    const toggleFavorite = (itemId: string, event: React.MouseEvent) => {
        event.stopPropagation();
        setFavorites(prev => {
            const updated = prev.includes(itemId)
                ? prev.filter(id => id !== itemId)
                : [...prev, itemId];
            try {
                localStorage.setItem('fitcheck-glasses-favorites', JSON.stringify(updated));
            } catch (e) {
                console.error('Failed to save favorites to localStorage', e);
            }
            return updated;
        });
    };

    const filteredWardrobe = wardrobe.filter(item => {
        if (item.category !== 'glasses') return false;
        if (showOnlyFavorites) {
            return favorites.includes(item.id);
        }
        return true;
    });

    const handleGarmentClick = async (item: WardrobeItem) => {
        if (isLoading || activeGarmentIds.includes(item.id)) return;
        setError(null);
        try {
            const file = await urlToFile(item.url, item.name);
            onGarmentSelect(file, item);
        } catch (err) {
            const detailedError = `Não foi possível carregar os óculos de sol/grau. Por favor, tente novamente ou use uma imagem diferente.`;
            setError(detailedError);
            console.error(`[CORS Check] Failed to load and convert wardrobe item from URL: ${item.url}.`, err);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            if (!file.type.startsWith('image/')) {
                setError('Por favor, selecione um arquivo de imagem.');
                return;
            }
            const baseName = file.name.split('.').slice(0, -1).join('.') || file.name;
            const customGarmentInfo: WardrobeItem = {
                id: `custom-${Date.now()}`,
                name: baseName,
                url: URL.createObjectURL(file),
                category: 'glasses',
            };
            onGarmentSelect(file, customGarmentInfo);
        }
    };

  return (
    <div className="pt-6 border-t border-gray-400/50">
        <div className="flex flex-col gap-3 mb-4">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-serif tracking-wider text-gray-800">Óculos Disponíveis</h2>
                <div className="flex gap-2">
                    {wardrobe.length > 0 ? (
                        <button
                            onClick={handleClearAllGlasses}
                            className="text-xs text-red-500 hover:text-red-700 transition-colors flex items-center gap-1 font-medium cursor-pointer py-1 px-2 rounded-md hover:bg-red-50"
                            title="Limpar todos os óculos da lista"
                        >
                            🧹 Limpar Tudo
                        </button>
                    ) : (
                        <button
                            onClick={handleRestoreDefaultGlasses}
                            className="text-xs text-teal-600 hover:text-teal-800 transition-colors flex items-center gap-1 font-medium cursor-pointer py-1 px-2 rounded-md hover:bg-teal-50"
                            title="Restaurar óculos padrão"
                        >
                            🔄 Restaurar Padrões
                        </button>
                    )}
                </div>
            </div>
            <div className="flex bg-gray-100 rounded-lg p-0.5 self-start">
                <button
                    onClick={() => setShowOnlyFavorites(false)}
                    className={`px-3 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                        !showOnlyFavorites
                            ? 'bg-white text-gray-900 shadow-sm'
                            : 'text-gray-500 hover:text-gray-950'
                    }`}
                >
                    Todos
                </button>
                <button
                    onClick={() => setShowOnlyFavorites(true)}
                    className={`px-3 py-1 text-xs font-semibold rounded-md transition-all flex items-center gap-1 cursor-pointer ${
                        showOnlyFavorites
                            ? 'bg-white text-gray-900 shadow-sm'
                            : 'text-gray-500 hover:text-gray-950'
                    }`}
                >
                    ❤️ Favoritos ({favorites.length})
                </button>
            </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
            {filteredWardrobe.map((item) => {
            const isActive = activeGarmentIds.includes(item.id);
            const isFavorited = favorites.includes(item.id);
            return (
                <div key={item.id} className="relative group aspect-square">
                    <button
                        onClick={() => handleGarmentClick(item)}
                        disabled={isLoading || isActive}
                        className="relative w-full h-full border rounded-lg overflow-hidden transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-800 disabled:opacity-60 disabled:cursor-not-allowed bg-gray-50 flex flex-col items-center justify-center"
                        aria-label={`Select ${item.name}`}
                    >
                        <img src={item.url} alt={item.name} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <p className="text-white text-[10px] font-bold text-center p-1 leading-tight">{item.name}</p>
                        </div>
                        {isActive && (
                            <div className="absolute inset-0 bg-gray-900/70 flex items-center justify-center">
                                <CheckCircleIcon className="w-8 h-8 text-white" />
                            </div>
                        )}
                    </button>
                    {/* Botão de excluir */}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onDeleteItem(item.id);
                        }}
                        className="absolute top-2 left-2 z-10 p-1.5 rounded-full shadow-md transition-all focus:outline-none bg-white hover:scale-110 active:scale-95 text-gray-400 hover:text-red-600 sm:opacity-0 group-hover:opacity-100 opacity-100 cursor-pointer"
                        title="Excluir óculos"
                    >
                        <Trash2Icon className="w-3.5 h-3.5" />
                    </button>
                    {/* Botão de favorito */}
                    <button
                        onClick={(e) => toggleFavorite(item.id, e)}
                        className={`absolute top-2 right-2 z-10 p-1.5 rounded-full shadow-md transition-all focus:outline-none bg-white hover:scale-110 active:scale-95 cursor-pointer ${
                            isFavorited ? 'text-red-500' : 'text-gray-400 hover:text-red-500'
                        }`}
                        title={isFavorited ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
                    >
                        <HeartIcon className="w-3.5 h-3.5" fill={isFavorited ? "currentColor" : "none"} />
                    </button>
                </div>
            );
            })}
            
            {!showOnlyFavorites && (
                <label htmlFor="custom-garment-upload" className={`relative aspect-square border-2 border-dashed rounded-lg flex flex-col items-center justify-center text-gray-500 transition-colors ${isLoading ? 'cursor-not-allowed bg-gray-100' : 'hover:border-gray-400 hover:text-gray-600 cursor-pointer'}`}>
                    <UploadCloudIcon className="w-6 h-6 mb-1"/>
                    <span className="text-[10px] text-center font-medium leading-tight px-1">Upload Óculos</span>
                    <input id="custom-garment-upload" type="file" className="hidden" accept="image/png, image/jpeg, image/webp, image/avif, image/heic, image/heif" onChange={handleFileChange} disabled={isLoading}/>
                </label>
            )}
        </div>
        {filteredWardrobe.length === 0 && (
             <p className="text-center text-sm text-gray-500 mt-4">
                 {showOnlyFavorites ? 'Você ainda não favoritou nenhum óculos!' : 'Nenhum item disponível.'}
             </p>
        )}
        {error && <p className="text-red-500 text-sm mt-4">{error}</p>}
    </div>
  );
};

export default WardrobePanel;