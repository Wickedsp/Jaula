import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Type } from "@google/genai";

// --- Gemini AI Helper ---
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const analyzeDeviceLabel = async (base64Image) => {
    try {
        // Step 1: Analyze image to get structured data
        const imagePart = {
            inlineData: {
                mimeType: 'image/jpeg',
                data: base64Image,
            },
        };
        const textPartForImage = {
            text: "Analyze the image of a device label. Extract brand, model, and serial number. Respond with a JSON object containing 'brand', 'model', and 'serialNumber'. Return empty strings for missing fields."
        };

        const imageAnalysisResponse = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: { parts: [imagePart, textPartForImage] },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        brand: { type: Type.STRING, description: 'Device brand or manufacturer name.' },
                        model: { type: Type.STRING, description: 'Device model name or number.' },
                        serialNumber: { type: Type.STRING, description: 'Device serial number (S/N).' },
                    },
                    required: ['brand', 'model', 'serialNumber']
                },
            },
        });
        
        const initialData = JSON.parse(imageAnalysisResponse.text.trim());
        const { brand, model, serialNumber } = initialData;

        // If we didn't get a model, we can't enrich. Return what we have.
        if (!model) {
            return {
                name: brand || '',
                description: model || '',
                serialNumber: serialNumber || '',
                deviceType: ''
            };
        }

        // Step 2: Enrich the data using a search-grounded call
        const enrichmentPrompt = `Using Google Search, find the full product name and category for a device with brand "${brand}" and model "${model}".
The category should be a single word like: PC, Laptop, Printer, Monitor, Keyboard, Mouse, Server, Router, Switch, Other.
Respond with ONLY the full product name, a semicolon, and then the category.
Example: HP LaserJet Pro M404dn;Printer`;
        
        const enrichmentResponse = await ai.models.generateContent({
           model: "gemini-2.5-flash",
           contents: enrichmentPrompt,
           config: {
             tools: [{googleSearch: {}}],
           },
        });

        const enrichmentText = enrichmentResponse.text.trim();
        const parts = enrichmentText.split(';');
        
        let fullName = [brand, model].filter(Boolean).join(' '); // Fallback name
        let deviceType = '';

        if (parts.length >= 2) {
            fullName = parts[0].trim();
            deviceType = parts[1].trim();
        }

        return {
            name: fullName,
            description: model, // Put the raw model number in description
            serialNumber: serialNumber,
            deviceType: deviceType
        };

    } catch (error) {
        console.error("Error analyzing image with AI:", error);
        throw new Error("No se pudo analizar la imagen. Por favor, inténtelo de nuevo.");
    }
};


// --- Helper Functions ---
const generateId = () => `id_${new Date().getTime()}_${Math.random().toString(36).substr(2, 9)}`;

// --- Custom Hooks for Data ---
const useLocalStorage = (key, initialValue, onSaveCallback = null) => {
  const [storedValue, setStoredValue] = useState(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error(error);
      return initialValue;
    }
  });

  const setValue = (value) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
      if (onSaveCallback) {
        onSaveCallback();
      }
    } catch (error) {
      console.error(error);
    }
  };

  return [storedValue, setValue];
};

// --- Icons ---
const CameraIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 16 16">
        <path d="M15 12a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h1.172a3 3 0 0 0 2.12-.879l.83-.828A1 1 0 0 1 6.827 3h2.344a1 1 0 0 1 .707.293l.828.828A3 3 0 0 0 12.828 5H14a1 1 0 0 1 1 1v6zM2 4.5A1.5 1.5 0 0 0 .5 6v6A1.5 1.5 0 0 0 2 13.5h12a1.5 1.5 0 0 0 1.5-1.5V6A1.5 1.5 0 0 0 14 4.5h-1.828a2 2 0 0 1-1.414-.586l-.828-.828A2 2 0 0 0 8.172 3H7.828a2 2 0 0 0-1.414.586l-.828.828A2 2 0 0 1 3.828 4.5H2z"/>
        <path d="M8 11a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5zm0 1a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z"/>
    </svg>
);

const BoxIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 16 16">
        <path d="M8.186 1.113a.5.5 0 0 0-.372 0L1.846 3.5 8 5.961 14.154 3.5 8.186 1.113zM15 4.239l-6.5 2.6v7.922l6.5-3.25V4.24zM7.5 14.762V6.838L1 4.239v7.284l6.5 3.24zM1.154 3.693 8 6.461 14.846 3.692 8.186 1.413 1.154 3.693z"/>
        <path d="m8 3.732 6 2.4v.056l-6 2.4-6-2.4V6.132L8 3.732z"/>
    </svg>
);

const ReportIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
        <path d="M4 0h8a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2zm0 1a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H4z"/>
        <path d="M4.5 12.5A.5.5 0 0 1 5 12h3a.5.5 0 0 1 0 1H5a.5.5 0 0 1-.5-.5zm0-2A.5.5 0 0 1 5 10h6a.5.5 0 0 1 0 1H5a.5.5 0 0 1-.5-.5zm0-2A.5.5 0 0 1 5 8h6a.5.5 0 0 1 0 1H5a.5.5 0 0 1-.5-.5zm0-2A.5.5 0 0 1 5 6h6a.5.5 0 0 1 0 1H5a.5.5 0 0 1-.5-.5z"/>
    </svg>
);

const TrashIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
        <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/>
        <path d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/>
    </svg>
);


// --- Components ---
const CameraScanner = ({ onScan, onClose }) => {
    const videoRef = useRef(null);
    const canvasRef = useRef(null); // Hidden canvas for capturing frames
    const [error, setError] = useState(null);
    const [isScanning, setIsScanning] = useState(false);
    const streamRef = useRef(null);

    // Effect to start camera
    useEffect(() => {
        let isMounted = true;

        const initScanner = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
                streamRef.current = stream;
                if (isMounted && videoRef.current) {
                    videoRef.current.srcObject = stream;
                    await videoRef.current.play();
                } else {
                    // Component unmounted before stream was ready, so stop the tracks immediately.
                    stream.getTracks().forEach(track => track.stop());
                }
            } catch (err) {
                console.error("Error starting camera:", err);
                if (isMounted) {
                    setError('No se pudo acceder a la cámara. Por favor, compruebe los permisos.');
                }
            }
        };

        initScanner();

        // Cleanup function
        return () => {
            isMounted = false;
            // Stop camera tracks
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }
        };
    }, []); // Empty dependency array means this runs once on mount and cleans up on unmount.

    const handleCaptureAndScan = async () => {
        if (!videoRef.current || !videoRef.current.srcObject || !videoRef.current.videoWidth) {
            setError("La cámara no está lista.");
            return;
        }

        setIsScanning(true);
        setError(null);

        const video = videoRef.current;
        const canvas = canvasRef.current;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext('2d');
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // Get base64 image data, remove prefix
        const base64Image = canvas.toDataURL('image/jpeg').split(',')[1];
        
        try {
            const result = await analyzeDeviceLabel(base64Image);
            onScan(result); // Pass the whole result object
            onClose(); // Close modal on success
        } catch (err) {
            setError(err.message || 'Error al analizar la imagen.');
        } finally {
            setIsScanning(false);
        }
    };


    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content camera-scanner" onClick={(e) => e.stopPropagation()}>
                 <button onClick={onClose} className="modal-close-button" aria-label="Cerrar escáner">&times;</button>
                 <h2>Escanear Etiqueta</h2>
                 {error && <p className="error-message">{error}</p>}
                 <div className="camera-viewport">
                    <video ref={videoRef} playsInline autoPlay muted />
                    <canvas ref={canvasRef} style={{ display: 'none' }} />
                    {isScanning && (
                        <div className="scanner-overlay">
                            <div className="spinner"></div>
                            <p>Analizando...</p>
                        </div>
                    )}
                 </div>
                 <p>Centre la etiqueta del dispositivo y presione "Escanear".</p>
                 <button onClick={handleCaptureAndScan} disabled={isScanning || !!error} className="scan-button">
                    {isScanning ? 'Procesando...' : 'Escanear'}
                 </button>
            </div>
        </div>
    );
};

const MainScreen = () => {
    const [saveStatus, setSaveStatus] = useState('');
    const saveTimeoutRef = useRef(null);

    const showSaveConfirmation = useCallback(() => {
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }
        setSaveStatus('Datos guardados');
        saveTimeoutRef.current = setTimeout(() => {
            setSaveStatus('');
        }, 2000);
    }, []);
    
    const [inventory, setInventory] = useLocalStorage('inventory', [], showSaveConfirmation);
    const [transactions, setTransactions] = useLocalStorage('transactions', [], showSaveConfirmation);
    const [newItem, setNewItem] = useState({ name: '', description: '', deviceType: '', serialNumber: '', quantity: '', location: '' });
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState('inventory');
    const [showScanner, setShowScanner] = useState(false);
    const [scanTarget, setScanTarget] = useState(null);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setNewItem(prev => ({ ...prev, [name]: value }));
    };
    
    const handleQuantityChange = (delta) => {
        setNewItem(prev => {
            const currentQuantity = parseInt(prev.quantity, 10) || 0;
            const newQuantity = Math.max(0, currentQuantity + delta); // Ensure quantity doesn't go below 0
            return { ...prev, quantity: newQuantity.toString() };
        });
    };

    const handleAddItem = (e) => {
        e.preventDefault();
        const quantity = parseInt(newItem.quantity, 10);
        if (!newItem.name || isNaN(quantity) || quantity < 0) {
            alert('Por favor, complete el nombre y una cantidad válida.');
            return;
        }

        const item = {
            id: generateId(),
            ...newItem,
            quantity,
            lastUpdated: new Date().toISOString()
        };
        const newInventory = [...inventory, item];
        setInventory(newInventory);

        const transaction = {
            id: generateId(),
            itemId: item.id,
            itemName: item.name,
            type: 'Entrada',
            quantity: item.quantity,
            timestamp: new Date().toISOString()
        };
        setTransactions(prev => [transaction, ...prev]);

        setNewItem({ name: '', description: '', deviceType: '', serialNumber: '', quantity: '', location: '' });
    };

    const handleDeleteItem = (itemToDelete) => {
        if (!window.confirm(`¿Está seguro de que desea dar de baja este artículo (${itemToDelete.name})? Esta acción es permanente.`)) {
            return;
        }

        const transaction = {
            id: generateId(),
            itemId: itemToDelete.id,
            itemName: itemToDelete.name,
            type: 'Baja',
            quantity: itemToDelete.quantity, // Log the quantity at time of deletion
            timestamp: new Date().toISOString()
        };
        setTransactions(prev => [transaction, ...prev]);

        const newInventory = inventory.filter(item => item.id !== itemToDelete.id);
        setInventory(newInventory);
    };

    const handleDecommissionItem = (e) => {
        e.preventDefault();
        const serialToDecommission = newItem.serialNumber.trim();
        if (!serialToDecommission) {
            alert('Por favor, introduzca o escanee un número de serie para dar de baja.');
            return;
        }

        const itemToDecommission = inventory.find(item => item.serialNumber.toLowerCase() === serialToDecommission.toLowerCase());

        if (!itemToDecommission) {
            alert(`No se encontró ningún artículo con el número de serie: ${serialToDecommission}`);
            return;
        }

        // handleDeleteItem already shows a confirm dialog and does the work.
        handleDeleteItem(itemToDecommission);

        // Clear form after action
        setNewItem({ name: '', description: '', deviceType: '', serialNumber: '', quantity: '', location: '' });
    };


    const updateStock = (item, change) => {
        const quantityChange = parseInt(prompt(`Cantidad a ${change > 0 ? 'añadir' : 'quitar'} para "${item.name}":`), 10);
        if (isNaN(quantityChange) || quantityChange <= 0) {
            alert("Por favor, ingrese un número válido.");
            return;
        }

        if (change < 0 && item.quantity < quantityChange) {
            alert("No se puede quitar más de la cantidad existente.");
            return;
        }
        
        const newQuantity = item.quantity + (change > 0 ? quantityChange : -quantityChange);

        const updatedInventory = inventory.map(i =>
            i.id === item.id ? { ...i, quantity: newQuantity, lastUpdated: new Date().toISOString() } : i
        );
        setInventory(updatedInventory);
        
        const transaction = {
            id: generateId(),
            itemId: item.id,
            itemName: item.name,
            type: change > 0 ? 'Entrada' : 'Salida',
            quantity: quantityChange,
            timestamp: new Date().toISOString()
        };
        setTransactions(prev => [transaction, ...prev]);
    };

    const openScanner = (target) => {
        setScanTarget(target);
        setShowScanner(true);
    };

    const handleScan = (scannedData) => {
        setShowScanner(false);
        if (!scannedData) return;
        
        const { name, description, serialNumber, deviceType } = scannedData;

        if (scanTarget === 'newItemSerial') {
            setNewItem(prev => ({ 
                ...prev, 
                name: name || prev.name,
                description: description || prev.description,
                serialNumber: serialNumber || prev.serialNumber,
                deviceType: deviceType || prev.deviceType, 
            }));
        } else if (scanTarget === 'search') {
            setSearchQuery(serialNumber || '');
        }
    };


    const filteredInventory = useMemo(() =>
        inventory.filter(item =>
            Object.values(item).some(val =>
                val.toString().toLowerCase().includes(searchQuery.toLowerCase())
            )
        ).sort((a,b) => a.name.localeCompare(b.name)),
        [inventory, searchQuery]
    );

    const handleGenerateReport = () => {
        if (filteredInventory.length === 0) {
            alert("No hay artículos para generar un informe.");
            return;
        }
    
        const headers = ["Nombre", "Descripción", "Tipo de Dispositivo", "Cantidad", "N/S", "Ubicación"];
    
        const escapeCsv = (val) => {
            const str = String(val);
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
        };
    
        const csvContent = [
            headers.join(','),
            ...filteredInventory.map(item => [
                escapeCsv(item.name),
                escapeCsv(item.description),
                escapeCsv(item.deviceType || ''),
                escapeCsv(item.quantity),
                escapeCsv(item.serialNumber),
                escapeCsv(item.location)
            ].join(','))
        ].join('\n');
    
        const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        if (link.download !== undefined) {
            const url = URL.createObjectURL(blob);
            const date = new Date().toISOString().split('T')[0];
            link.setAttribute("href", url);
            link.setAttribute("download", `informe_stock_${date}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }
    };
    
    const handleViewFullList = () => {
        setSearchQuery('');
        setActiveTab('inventory');
    };

    const isAddItemDisabled = !newItem.name.trim() || !newItem.quantity || parseInt(newItem.quantity, 10) < 0;
    const isDecommissionDisabled = !newItem.serialNumber.trim();

    return (
        <div className="main-app">
            {saveStatus && <div className="save-status-indicator">{saveStatus}</div>}
            {showScanner && <CameraScanner onScan={handleScan} onClose={() => setShowScanner(false)} />}
            <header className="app-header">
                <h1>Control de Inventario TI</h1>
            </header>
            <div className="app-content">
                <aside className="sidebar">
                    <form onSubmit={handleAddItem} className="form-section">
                        <h2>Añadir Nuevo Artículo</h2>
                        <div className="form-group">
                            <label htmlFor="name">Nombre del Artículo</label>
                            <input id="name" name="name" value={newItem.name} onChange={handleInputChange} required />
                        </div>
                        <div className="form-group">
                            <label htmlFor="description">Descripción (Modelo)</label>
                            <input id="description" name="description" value={newItem.description} onChange={handleInputChange} />
                        </div>
                        <div className="form-group">
                            <label htmlFor="deviceType">Tipo de Dispositivo</label>
                            <input id="deviceType" name="deviceType" value={newItem.deviceType} onChange={handleInputChange} />
                        </div>
                        <div className="form-group">
                            <label htmlFor="serialNumber">Número de Serie (N/S)</label>
                            <div className="input-with-button">
                                <input id="serialNumber" name="serialNumber" value={newItem.serialNumber} onChange={handleInputChange} />
                                <button type="button" className="icon-button" aria-label="Escanear N/S" onClick={() => openScanner('newItemSerial')}><CameraIcon /></button>
                            </div>
                        </div>
                        <div className="form-group">
                            <label htmlFor="quantity">Cantidad Inicial</label>
                            <div className="quantity-control">
                                <button type="button" onClick={() => handleQuantityChange(-1)} aria-label="Disminuir cantidad">-</button>
                                <input id="quantity" name="quantity" type="number" value={newItem.quantity} onChange={handleInputChange} required min="0" />
                                <button type="button" onClick={() => handleQuantityChange(1)} aria-label="Aumentar cantidad">+</button>
                            </div>
                        </div>
                        <div className="form-group">
                            <label htmlFor="location">Ubicación</label>
                            <input id="location" name="location" value={newItem.location} onChange={handleInputChange} />
                        </div>
                        <div className="form-buttons">
                           <button type="submit" disabled={isAddItemDisabled}>Añadir al Inventario</button>
                           <button type="button" className="btn-danger" onClick={handleDecommissionItem} disabled={isDecommissionDisabled}>
                                Dar de Baja
                           </button>
                        </div>
                    </form>
                </aside>
                <main className="content-area">
                    <div className="content-header">
                        <div className="content-header-title-group">
                            <h2>Panel Principal</h2>
                            <button onClick={handleViewFullList} className="view-list-button">
                                <BoxIcon /> Ver Listado
                            </button>
                            <button onClick={handleGenerateReport} className="report-button">
                                <ReportIcon /> Generar Informe
                            </button>
                        </div>
                        <div className="search-bar">
                            <input
                                type="text"
                                placeholder="Buscar en el inventario..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                            />
                            <button className="icon-button" aria-label="Buscar con cámara" onClick={() => openScanner('search')}><CameraIcon /></button>
                        </div>
                    </div>
                    <div className="tabs">
                        <div className={`tab ${activeTab === 'inventory' ? 'active' : ''}`} onClick={() => setActiveTab('inventory')}>Inventario ({filteredInventory.length})</div>
                        <div className={`tab ${activeTab === 'transactions' ? 'active' : ''}`} onClick={() => setActiveTab('transactions')}>Movimientos ({transactions.length})</div>
                    </div>

                    <div className="tab-content inventory-table-wrapper">
                         {activeTab === 'inventory' && (
                             filteredInventory.length > 0 ? (
                                <table className="table-responsive">
                                    <thead>
                                        <tr>
                                            <th>Nombre</th>
                                            <th>Descripción</th>
                                            <th>Tipo</th>
                                            <th>Cantidad</th>
                                            <th>N/S</th>
                                            <th>Ubicación</th>
                                            <th>Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredInventory.map(item => (
                                            <tr key={item.id}>
                                                <td>{item.name}</td>
                                                <td>{item.description}</td>
                                                <td>{item.deviceType || 'N/A'}</td>
                                                <td>{item.quantity}</td>
                                                <td>{item.serialNumber}</td>
                                                <td>{item.location}</td>
                                                <td className="actions-cell">
                                                    <button className="btn-success" onClick={() => updateStock(item, 1)} aria-label={`Añadir a ${item.name}`}>+</button>
                                                    <button className="btn-danger" onClick={() => updateStock(item, -1)} aria-label={`Quitar de ${item.name}`}>-</button>
                                                    <button className="btn-delete" onClick={() => handleDeleteItem(item)} aria-label={`Dar de baja ${item.name}`}><TrashIcon /></button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                             ) : (
                                <div className="placeholder">
                                    <BoxIcon />
                                    <h3>No hay artículos en el inventario</h3>
                                    <p>{searchQuery ? 'Pruebe con otra búsqueda' : 'Añada un artículo desde el panel de la izquierda para empezar.'}</p>

                                </div>
                             )
                         )}
                         {activeTab === 'transactions' && (
                              transactions.length > 0 ? (
                                 <table>
                                    <thead>
                                        <tr>
                                            <th>Fecha</th>
                                            <th>Artículo</th>
                                            <th>Tipo</th>
                                            <th>Cantidad</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {transactions.map(t => (
                                            <tr key={t.id}>
                                                <td>{new Date(t.timestamp).toLocaleString()}</td>
                                                <td>{t.itemName}</td>
                                                <td style={{ color: t.type === 'Entrada' ? 'var(--success)' : (t.type === 'Baja' ? 'var(--error)' : 'var(--error)') }}>{t.type}</td>
                                                <td>{t.quantity}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                             ) : (
                                 <div className="placeholder">
                                    <BoxIcon />
                                    <h3>No hay movimientos registrados</h3>
                                    <p>Cualquier entrada o salida de stock aparecerá aquí.</p>
                                </div>
                             )
                         )}
                    </div>
                </main>
            </div>
        </div>
    );
};

const App = () => {
    useEffect(() => {
        const lockOrientationGlobally = async () => {
            try {
                if (screen.orientation && typeof (screen.orientation as any).lock === 'function') {
                    await (screen.orientation as any).lock('portrait');
                    console.log('La orientación de la aplicación se ha bloqueado en modo vertical.');
                } else {
                    console.info('La API de bloqueo de orientación no es compatible con este navegador o dispositivo.');
                }
            } catch (error) {
                console.warn('No se pudo bloquear la orientación de la pantalla de forma automática. Esto puede ser normal.', error);
            }
        };

        lockOrientationGlobally();
    }, []); // El array vacío asegura que esto se ejecute solo una vez.

    return <MainScreen />;
};

const container = document.getElementById('root');
const root = createRoot(container);
root.render(<App />);