import { useState } from 'react';
import { supabase } from './lib/supabaseClient';
import type { Wholesaler } from './types/wholesaler';
import { WholesalerList } from './components/WholesalerList';
import { WholesalerDetail } from './components/WholesalerDetail';

function App() {
  const [selectedWholesalerId, setSelectedWholesalerId] = useState<string | null>(null);
  const [selectedWholesaler, setSelectedWholesaler] = useState<Wholesaler | null>(null);
  const [loadingContext, setLoadingContext] = useState(false);

  // When a user selects from the list
  const handleReview = (wholesaler: Wholesaler) => {
    setSelectedWholesaler(wholesaler);
    setSelectedWholesalerId(wholesaler.id);
  };

  // Free the current selection
  const handleBack = () => {
    setSelectedWholesalerId(null);
    setSelectedWholesaler(null);
  };

  // Refetch selected user on action complete
  const handleActionComplete = async () => {
    if (!selectedWholesalerId) return;
    setLoadingContext(true);
    try {
      const { data, error } = await supabase
        .from('wholesalers')
        .select('*')
        .eq('id', selectedWholesalerId)
        .single();
      
      if (error) throw error;
      setSelectedWholesaler(data);
    } catch (err) {
      console.error('Failed to refetch wholesaler data', err);
    } finally {
      setLoadingContext(false);
    }
  };

  return (
    <div className="min-h-screen bg-white text-black selection:bg-black selection:text-white font-sans">
      <header className="border-b border-gray-200 bg-black text-white px-8 py-4">
        <h2 className="text-xl font-bold uppercase tracking-widest m-0">JewelIndia Verification<span className="text-gray-400 opacity-60 ml-2 font-normal lowercase tracking-normal text-sm">v1.0</span></h2>
      </header>

      <main>
        {!selectedWholesalerId || !selectedWholesaler ? (
          <WholesalerList onReview={handleReview} />
        ) : (
          <div className="relative">
            {loadingContext && (
               <div className="absolute inset-0 bg-white/50 backdrop-blur-sm z-10 flex items-center justify-center">
                 <span className="bg-black text-white px-4 py-2 text-sm font-semibold uppercase tracking-widest shadow-2xl">Refreshing context...</span>
               </div>
            )}
            <WholesalerDetail 
              wholesaler={selectedWholesaler} 
              onBack={handleBack} 
              onActionComplete={handleActionComplete} 
            />
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
