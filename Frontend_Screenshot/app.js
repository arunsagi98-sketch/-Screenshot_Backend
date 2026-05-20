// --- API Configuration ---
// Pointing to your local backend. 
// If using ngrok/localtunnel, change this to the https URL.
const API_BASE_URL = 'http://127.0.0.1:8000';

// DOM Elements
const urlInput = document.getElementById('url-input');
const urlCount = document.getElementById('url-count');
const fileInput = document.getElementById('file-input');
const uploadZone = document.getElementById('upload-zone');
const uploadPreview = document.getElementById('upload-preview');
const startBtn = document.getElementById('start-btn');
const refreshBtn = document.getElementById('refresh-btn');
const bulkDeleteBtn = document.getElementById('bulk-delete-btn');
const exportPdfBtn = document.getElementById('export-pdf-btn');
const resultsGrid = document.getElementById('results-grid');
const resultsCount = document.getElementById('results-count');

// State
let uploadedFiles = [];

// --- Event Listeners ---

// Update URL count as user types
urlInput.addEventListener('input', () => {
    const urls = urlInput.value.split(/[\n,]+/).map(u => u.trim()).filter(u => u);
    urlCount.textContent = `${urls.length} valid URL${urls.length !== 1 ? 's' : ''}`;
});

// Upload Zone Click
uploadZone.addEventListener('click', () => fileInput.click());

// Drag and Drop
uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.style.borderColor = 'var(--accent-color)';
});
uploadZone.addEventListener('dragleave', () => {
    uploadZone.style.borderColor = 'var(--panel-border)';
});
uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.style.borderColor = 'var(--panel-border)';
    if (e.dataTransfer.files.length) {
        handleFiles(e.dataTransfer.files);
    }
});

fileInput.addEventListener('change', () => {
    if (fileInput.files.length) {
        handleFiles(fileInput.files);
    }
});

// Buttons
startBtn.addEventListener('click', startScan);
refreshBtn.addEventListener('click', fetchResults);
bulkDeleteBtn.addEventListener('click', bulkDeleteSelected);
if (exportPdfBtn) {
    exportPdfBtn.addEventListener('click', exportSelectedToPDF);
}

// --- Functions ---

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icon = type === 'success' ? 'bx-check-circle' : 'bx-error-circle';
    toast.innerHTML = `<i class='bx ${icon}'></i> ${message}`;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

async function handleFiles(files) {
    const formData = new FormData();
    let addedCount = 0;

    for (const file of files) {
        if (file.type.startsWith('image/')) {
            formData.append('files', file);
            uploadedFiles.push(file.name);
            
            // Add chip to preview
            const chip = document.createElement('div');
            chip.className = 'preview-chip';
            chip.innerHTML = `<i class='bx bx-loader-alt bx-spin'></i> <span>${file.name.substring(0, 12)}...</span>`;
            uploadPreview.appendChild(chip);

            // Read dimensions client-side in real-time
            const objectUrl = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => {
                chip.innerHTML = `
                    <img src="${objectUrl}" style="width: 18px; height: 18px; object-fit: cover; border-radius: 4px; border: 1px solid var(--panel-border);" />
                    <span style="font-weight: 500;">${file.name.substring(0, 10)}${file.name.length > 10 ? '...' : ''}</span>
                    <span style="color: var(--text-secondary); font-size: 0.7rem; font-family: monospace; font-weight: 600;">(${img.width}x${img.height})</span>
                    <button class="delete-creative-btn" style="background: transparent; border: none; color: var(--text-secondary); cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 2px; margin-left: 4px; transition: color 0.2s;" title="Remove Creative">
                        <i class='bx bx-x' style="font-size: 1rem;"></i>
                    </button>
                `;

                const deleteBtn = chip.querySelector('.delete-creative-btn');
                if (deleteBtn) {
                    deleteBtn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        try {
                            const delResponse = await fetch(`${API_BASE_URL}/delete-creative?filename=${encodeURIComponent(file.name)}`, {
                                method: 'DELETE'
                            });
                            if (delResponse.ok) {
                                uploadedFiles = uploadedFiles.filter(name => name !== file.name);
                                chip.remove();
                                showToast(`Removed creative: ${file.name}`);
                            } else {
                                showToast('Failed to delete creative', 'error');
                            }
                        } catch (err) {
                            console.error(err);
                            showToast('Error removing creative', 'error');
                        }
                    });
                }
            };
            img.onerror = () => {
                chip.innerHTML = `<i class='bx bx-image-x' style='color: var(--danger);'></i> <span>${file.name.substring(0, 12)}...</span>`;
            };
            img.src = objectUrl;

            addedCount++;
        }
    }

    if (addedCount > 0) {
        try {
            uploadZone.querySelector('i').className = 'bx bx-loader-alt bx-spin';
            const response = await fetch(`${API_BASE_URL}/upload-creatives`, {
                method: 'POST',
                body: formData
            });
            
            if (response.ok) {
                showToast(`Successfully uploaded ${addedCount} image(s)`);
            } else {
                showToast('Failed to upload images', 'error');
            }
        } catch (error) {
            console.error(error);
            showToast('Error connecting to backend', 'error');
        } finally {
            uploadZone.querySelector('i').className = 'bx bx-cloud-upload';
        }
    }
}

// --- Real-time Progress Tracking Elements ---
const progressModal = document.getElementById('progress-modal');
const finishProgressBtn = document.getElementById('finish-progress-btn');
const closeProgressBtn = document.getElementById('close-progress-btn');

finishProgressBtn.addEventListener('click', () => {
    progressModal.style.display = 'none';
});
closeProgressBtn.addEventListener('click', () => {
    progressModal.style.display = 'none';
});

let totalCreativesCount = 0;
let matchedCreativesCount = 0;

function addLog(message, type = 'bullet') {
    const progressLog = document.getElementById('progress-log');
    if (!progressLog) return;
    
    const logItem = document.createElement('div');
    logItem.className = `log-item ${type}`;
    
    let icon = '•';
    if (type === 'success') icon = '✔';
    else if (type === 'error') icon = '✖';
    else if (type === 'warning') icon = '⚠';
    else if (type === 'info') icon = 'ℹ';
    
    logItem.innerHTML = `<span style="margin-right: 6px; opacity: 0.7; font-weight: bold;">${icon}</span>${message}`;
    progressLog.appendChild(logItem);
    progressLog.scrollTop = progressLog.scrollHeight;
}

function handleScanEvent(event) {
    const type = event.type;
    const payload = event.payload;
    
    const progressMainTitle = document.getElementById('progress-main-title');
    const progressSubtitle = document.getElementById('progress-subtitle');
    const progressSpinner = document.getElementById('progress-spinner');
    const progressBarFill = document.getElementById('progress-bar-fill');
    const progressCreativesList = document.getElementById('progress-creatives-list');

    switch (type) {
        case 'started':
            totalCreativesCount = payload.creatives.length;
            matchedCreativesCount = 0;
            progressBarFill.style.width = '0%';
            progressCreativesList.innerHTML = '';
            
            if (totalCreativesCount === 0) {
                progressCreativesList.innerHTML = `
                    <div style="text-align: center; color: var(--text-secondary); font-size: 0.85rem; padding: 10px;">
                        No creatives found in input_images. Direct upload needed!
                    </div>
                `;
            } else {
                payload.creatives.forEach(c => {
                    const cleanName = c.name.replace(/[^a-zA-Z0-9]/g, '_');
                    const item = document.createElement('div');
                    item.className = 'progress-creative-item';
                    item.id = `creative-item-${cleanName}`;
                    item.innerHTML = `
                        <div class="creative-name-container">
                            <span class="creative-name" title="${c.name}">${c.name}</span>
                            <span class="creative-meta"><i class='bx bx-crop'></i> ${c.width} x ${c.height} px</span>
                        </div>
                        <div class="creative-status-tag pending" id="creative-status-${cleanName}">
                            <i class='bx bx-time' style="vertical-align: middle;"></i> Pending
                        </div>
                    `;
                    progressCreativesList.appendChild(item);
                });
            }
            
            addLog(`Found ${totalCreativesCount} creative banner asset(s). Starting automation...`, 'info');
            break;
            
        case 'pass_start':
            const passNum = payload.pass_num;
            if (passNum === 1) {
                progressMainTitle.textContent = `Processing Initial Pass (1:1)...`;
                progressSubtitle.textContent = `Testing creative size matching against website ad containers...`;
                addLog(`Pass 1 running: active matching strategy initialized...`, 'info');
            } else if (passNum === 2) {
                progressMainTitle.textContent = `Retrying Leftover Creatives (Pass 2)...`;
                progressSubtitle.textContent = `Attempting reload-based detection for leftover creatives...`;
                addLog(`Pass 2 retry running for ${payload.remaining_creatives.length} unmatched creative(s).`, 'warning');
            }
            break;
            
        case 'site_start':
            const cleanUrl = payload.url.replace('https://', '').replace('http://', '').split('/')[0];
            progressSubtitle.textContent = `Opening website: ${cleanUrl}...`;
            break;
            
        case 'site_loading':
            const loadUrl = payload.url.replace('https://', '').replace('http://', '').split('/')[0];
            progressSubtitle.textContent = `Loading DOM components for ${loadUrl}...`;
            addLog(`Opening URL: ${payload.url}`, 'bullet');
            break;
            
        case 'site_scrolling':
            progressSubtitle.textContent = `Mimicking user scrolls to trigger lazy ads...`;
            break;
            
        case 'site_detecting':
            progressSubtitle.textContent = `Analyzing page viewport and ad containers...`;
            break;
            
        case 'match_success':
            matchedCreativesCount++;
            const pct = Math.round((matchedCreativesCount / totalCreativesCount) * 100);
            progressBarFill.style.width = `${pct}%`;
            
            const matchedName = payload.creative_name;
            const siteDomain = payload.url.replace('https://', '').replace('http://', '').split('/')[0];
            
            const cleanMName = matchedName.replace(/[^a-zA-Z0-9]/g, '_');
            const itemDiv = document.getElementById(`creative-item-${cleanMName}`);
            const statusDiv = document.getElementById(`creative-status-${cleanMName}`);
            
            if (itemDiv && statusDiv) {
                itemDiv.className = 'progress-creative-item success';
                statusDiv.className = 'creative-status-tag matched';
                statusDiv.innerHTML = `<i class='bx bx-check-circle' style="font-size: 1.1rem; vertical-align: middle;"></i> ${siteDomain}`;
            }
            
            addLog(`Matched ${matchedName} on ${siteDomain} (${payload.dimensions})!`, 'success');
            break;
            
        case 'no_match_on_site':
            const skipDomain = payload.url.replace('https://', '').replace('http://', '').split('/')[0];
            addLog(`No dimension match found on ${skipDomain} in Pass ${payload.pass_num}.`, 'bullet');
            break;
            
        case 'site_failed':
            const failDomain = payload.url.replace('https://', '').replace('http://', '').split('/')[0];
            addLog(`Failed scanning ${failDomain} (Pass ${payload.pass_num}): ${payload.error}`, 'error');
            break;
            
        case 'creative_failed':
            const failName = payload.creative_name;
            const cleanFName = failName.replace(/[^a-zA-Z0-9]/g, '_');
            const fItemDiv = document.getElementById(`creative-item-${cleanFName}`);
            const fStatusDiv = document.getElementById(`creative-status-${cleanFName}`);
            
            if (fItemDiv && fStatusDiv) {
                fItemDiv.className = 'progress-creative-item failed';
                fStatusDiv.className = 'creative-status-tag failed';
                fStatusDiv.innerHTML = `<i class='bx bx-x-circle' style="font-size: 1.1rem; vertical-align: middle;"></i> Failed`;
            }
            addLog(`Exhausted all retries for ${failName} (${payload.width}x${payload.height}).`, 'error');
            break;
            
        case 'finished':
            progressMainTitle.textContent = `Scan Process Completed!`;
            progressSubtitle.textContent = `Headless browser session terminated. Check results below!`;
            progressSpinner.innerHTML = `<i class='bx bxs-check-circle' style="font-size: 3rem; color: var(--success); filter: drop-shadow(0 0 10px rgba(16, 185, 129, 0.4));"></i>`;
            progressBarFill.style.width = '100%';
            
            finishProgressBtn.removeAttribute('disabled');
            finishProgressBtn.style.opacity = '1';
            finishProgressBtn.style.cursor = 'pointer';
            finishProgressBtn.textContent = 'Close & View Results';
            closeProgressBtn.style.display = 'block';
            
            addLog(`Automation run complete. Matched mockups stored in PostgreSQL database.`, 'success');
            showToast('Scan completed successfully!');
            fetchResults();
            break;
            
        case 'error':
            progressMainTitle.textContent = `Scan Process Interrupted`;
            progressSubtitle.textContent = payload.message || 'Unknown automation failure';
            progressSpinner.innerHTML = `<i class='bx bxs-error-circle' style="font-size: 3rem; color: var(--danger);"></i>`;
            progressBarFill.style.background = 'var(--danger)';
            
            finishProgressBtn.removeAttribute('disabled');
            finishProgressBtn.style.opacity = '1';
            finishProgressBtn.style.cursor = 'pointer';
            finishProgressBtn.textContent = 'Dismiss';
            closeProgressBtn.style.display = 'block';
            
            addLog(`Scanner run failed: ${payload.message}`, 'error');
            showToast('Scan process failed to complete.', 'error');
            break;
    }
}

async function startScan() {
    const urls = urlInput.value.split(/[\n,]+/).map(u => u.trim()).filter(u => u);
    
    if (urls.length === 0) {
        showToast('Please enter at least one URL', 'error');
        return;
    }
    
    if (uploadedFiles.length === 0) {
        showToast('Please upload at least one creative image', 'error');
        return;
    }

    // Initialize Progress Modal UI State
    const progressMainTitle = document.getElementById('progress-main-title');
    const progressSubtitle = document.getElementById('progress-subtitle');
    const progressSpinner = document.getElementById('progress-spinner');
    const progressBarFill = document.getElementById('progress-bar-fill');
    const progressCreativesList = document.getElementById('progress-creatives-list');
    const progressLog = document.getElementById('progress-log');

    progressMainTitle.textContent = 'Launching Scan Engine...';
    progressSubtitle.textContent = 'Initializing browser containers...';
    progressSpinner.innerHTML = `<i class='bx bx-loader-alt bx-spin' style="font-size: 2.5rem; color: var(--accent-color);"></i>`;
    progressBarFill.style.width = '0%';
    progressCreativesList.innerHTML = '';
    progressLog.innerHTML = '';

    finishProgressBtn.setAttribute('disabled', 'true');
    finishProgressBtn.style.opacity = '0.6';
    finishProgressBtn.style.cursor = 'not-allowed';
    finishProgressBtn.textContent = 'Scanner Running...';
    closeProgressBtn.style.display = 'none';

    progressModal.style.display = 'flex';

    try {
        const response = await fetch(`${API_BASE_URL}/process`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                urls: urls,
                creatives: uploadedFiles
            })
        });

        if (!response.ok) {
            throw new Error(`Failed with server status code: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = "";

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop(); // Hold partial line in buffer

            for (const line of lines) {
                if (line.trim()) {
                    try {
                        const event = JSON.parse(line);
                        handleScanEvent(event);
                    } catch (e) {
                        console.error("Error parsing NDJSON chunk line:", e, line);
                    }
                }
            }
        }

        // Catch leftover buffer if any
        if (buffer.trim()) {
            try {
                const event = JSON.parse(buffer);
                handleScanEvent(event);
            } catch (e) {
                console.error("Error parsing remaining buffer line:", e, buffer);
            }
        }

    } catch (error) {
        console.error(error);
        handleScanEvent({
            type: 'error',
            payload: { message: error.message || 'Connection error. Check backend server logs.' }
        });
    }
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
}

async function fetchResults() {
    refreshBtn.innerHTML = `<i class='bx bx-loader-alt bx-spin'></i>`;
    
    try {
        const response = await fetch(`${API_BASE_URL}/results`);
        if (!response.ok) throw new Error("Failed to fetch");
        
        const data = await response.json();
        renderResults(data);
        showToast('Results updated');
    } catch (error) {
        console.error(error);
        showToast('Failed to load recent results', 'error');
    } finally {
        refreshBtn.innerHTML = `<i class='bx bx-refresh'></i> Refresh`;
    }
}

function renderResults(results) {
    // Filter out failed scans and show ONLY successful mockup screenshots
    const successfulResults = results.filter(res => res.status === 'success' && res.screenshot_path);
    
    resultsCount.textContent = `${successfulResults.length} mockup${successfulResults.length !== 1 ? 's' : ''}`;
    resultsGrid.innerHTML = '';

    if (successfulResults.length === 0) {
        resultsGrid.innerHTML = `
            <div class="empty-state">
                <i class='bx bx-history'></i>
                <p>No successful mockups yet. Upload your creatives and run a scan to see your screenshots!</p>
            </div>
        `;
        return;
    }

    successfulResults.forEach(res => {
        const card = document.createElement('div');
        card.className = 'result-card';
        
        const isSuccess = res.status === 'success';
        
        // CRITICAL: Construct full image URL
        const imageUrl = res.screenshot_path ? `${API_BASE_URL}/${res.screenshot_path}` : null;
        
        const imageHtml = (isSuccess && imageUrl) 
            ? `<a href="${imageUrl}" target="_blank" title="Click to view full screenshot">
                 <img src="${imageUrl}" alt="Screenshot of ${res.url}" loading="lazy" style="cursor: pointer;" onerror="this.parentElement.outerHTML='<div class=\\'no-image\\'><i class=\\'bx bx-image-x\\' style=\\'font-size: 3rem; margin-bottom: 10px; color: #ef4444;\\'></i><p>Image not found</p></div>'">
               </a>`
            : `<div class="no-image">
                 <i class='bx bx-image-x' style="font-size: 3rem; margin-bottom: 10px;"></i>
                 <p>No screenshot</p>
               </div>`;

        card.innerHTML = `
            <div class="card-header">
                <div style="display: flex; align-items: center; gap: 8px; overflow: hidden;">
                    <input type="checkbox" class="result-checkbox" value="${res.id}" style="cursor: pointer; width: 16px; height: 16px;">
                    <div class="card-url" title="${res.url}">${res.url.replace('https://', '').replace('http://', '')}</div>
                </div>
                <div style="display: flex; gap: 8px; align-items: center;">
                    <div class="status-tag ${isSuccess ? 'status-success' : 'status-failed'}">
                        ${res.status}
                    </div>
                    <button class="delete-btn" onclick="deleteResult(${res.id})" title="Delete Result">
                        <i class='bx bx-trash'></i>
                    </button>
                </div>
            </div>
            <div class="card-image">
                ${imageHtml}
            </div>
            <div class="card-footer">
                <div class="stat" title="Ads detected / Ads replaced">
                    <i class='bx bx-target-lock'></i> ${res.matches_found}/${res.ads_found} matches
                </div>
                <div class="stat">
                    <i class='bx bx-time-five'></i> ${formatDate(res.created_at)}
                </div>
            </div>
        `;
        
        resultsGrid.appendChild(card);
    });
}

async function deleteResult(id) {
    if (!confirm('Are you sure you want to delete this result?')) return;
    
    try {
        const response = await fetch(`${API_BASE_URL}/results/${id}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            showToast('Result deleted successfully');
            fetchResults();
        } else {
            showToast('Failed to delete result', 'error');
        }
    } catch (error) {
        console.error(error);
        showToast('Error connecting to backend', 'error');
    }
}
window.deleteResult = deleteResult;

async function bulkDeleteSelected() {
    const checkboxes = document.querySelectorAll('.result-checkbox:checked');
    if (checkboxes.length === 0) {
        showToast('Please select at least one result to delete', 'error');
        return;
    }
    
    if (!confirm(`Are you sure you want to delete ${checkboxes.length} selected results?`)) return;
    
    bulkDeleteBtn.innerHTML = `<i class='bx bx-loader-alt bx-spin'></i> Deleting...`;
    bulkDeleteBtn.disabled = true;
    
    let successCount = 0;
    
    try {
        // Send delete request for each selected ID concurrently
        const deletePromises = Array.from(checkboxes).map(async (cb) => {
            const id = cb.value;
            const response = await fetch(`${API_BASE_URL}/results/${id}`, { method: 'DELETE' });
            if (response.ok) successCount++;
        });
        
        await Promise.all(deletePromises);
        
        showToast(`Successfully deleted ${successCount} result(s)`);
        fetchResults();
    } catch (error) {
        console.error(error);
        showToast('Error occurred during bulk deletion', 'error');
    } finally {
        bulkDeleteBtn.innerHTML = `<i class='bx bx-trash'></i> Delete Selected`;
        bulkDeleteBtn.disabled = false;
    }
}

const pptModal = document.getElementById('ppt-modal');
const closeModalBtn = document.getElementById('close-modal-btn');
const generatePptBtn = document.getElementById('generate-ppt-btn');
const exportPptBtn = document.getElementById('export-ppt-btn');

exportPptBtn.addEventListener('click', () => {
    const checkboxes = document.querySelectorAll('.result-checkbox:checked');
    if (checkboxes.length === 0) {
        showToast('Please select at least one result to export', 'error');
        return;
    }
    pptModal.style.display = 'flex';
});

closeModalBtn.addEventListener('click', () => {
    pptModal.style.display = 'none';
});

generatePptBtn.addEventListener('click', exportSelectedToPPT);

async function exportSelectedToPPT() {
    const checkboxes = document.querySelectorAll('.result-checkbox:checked');
    
    // Get inputs
    const title = document.getElementById('pdf-campaign-title').value || 'Campaign Title';
    const startDate = document.getElementById('pdf-start-date').value || 'Start Date';
    const endDate = document.getElementById('pdf-end-date').value || 'End Date';
    const formatStr = document.getElementById('pdf-format').value || 'Banner';

    generatePptBtn.innerHTML = `<i class='bx bx-loader-alt bx-spin'></i> Generating...`;
    generatePptBtn.disabled = true;
    
    try {
        const pptx = new PptxGenJS();
        // Custom format mapping jsPDF mm to PptxGenJS inches
        pptx.defineLayout({ name:'CUSTOM', width: 338.67 / 25.4, height: 190.5 / 25.4 });
        pptx.layout = 'CUSTOM';
        
        // Helper to draw bold label and normal value with modern premium Segoe UI
        const drawLabelValue = (slide, label, value, x_mm, y_mm) => {
            const x = x_mm / 25.4;
            const y = (y_mm - 5) / 25.4; // offset y slightly as pptxgenjs y is top of textbox
            
            // Add label and value inline using Segoe UI and high-contrast dark slate
            slide.addText([
                { text: label + " ", options: { bold: true, fontFace: 'Segoe UI', fontSize: 18, color: '1E293B' } },
                { text: value, options: { bold: false, fontFace: 'Segoe UI', fontSize: 18, color: '000000' } }
            ], { x: x, y: y, w: 4, h: 0.5, valign: 'middle' });
        };
        
        // Fetch exact cover template background from the reference PPT.
        let bgCoverBase64 = null;
        try {
            const bgResponse = await fetch(`${API_BASE_URL}/get-image-base64?path=cover_bg.jpg`);
            if (bgResponse.ok) {
                const bgData = await bgResponse.json();
                if (!bgData.error) bgCoverBase64 = bgData.dataUrl;
            }
        } catch (e) {
            console.warn("Could not fetch exact cover background image.");
        }

        // Fetch Gradient background image (specifically for screenshot slides)
        let bgGradientBase64 = null;
        try {
            const bgResponse = await fetch(`${API_BASE_URL}/get-image-base64?path=gradient_bg.jpg`);
            if (bgResponse.ok) {
                const bgData = await bgResponse.json();
                if (!bgData.error) bgGradientBase64 = bgData.dataUrl;
            }
        } catch (e) {
            console.warn("Could not fetch gradient background template image.");
        }

        // Fetch Billion Tags Logo image for cover page centering
        let logoBase64 = null;
        try {
            const logoResponse = await fetch(`${API_BASE_URL}/get-image-base64?path=billiontags_logo.png`);
            if (logoResponse.ok) {
                const logoData = await logoResponse.json();
                if (!logoData.error) logoBase64 = logoData.dataUrl;
            }
        } catch (e) {
            console.warn("Could not fetch billiontags logo image.");
        }

        // Fetch the colorful fill used by text in the reference PPT.
        let textFillBase64 = null;
        try {
            const fillResponse = await fetch(`${API_BASE_URL}/get-image-base64?path=text_fill.png`);
            if (fillResponse.ok) {
                const fillData = await fillResponse.json();
                if (!fillData.error) textFillBase64 = fillData.dataUrl;
            }
        } catch (e) {
            console.warn("Could not fetch text fill image.");
        }

        // CONDITIONAL BACKGROUND APPLIERS
        const applyGradientBackground = (slide) => {
            if (bgGradientBase64) {
                slide.background = { data: bgGradientBase64 };
            }
        };

        const loadDataUrlImage = (src) => new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('Failed to load image'));
            img.src = src;
        });

        const createPatternTextImage = async ({ title, dateRange, startDate, endDate, formatStr, patternDataUrl }) => {
            const canvas = document.createElement('canvas');
            canvas.width = 1680;
            canvas.height = 460;
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            let fillStyle = '#080812';
            if (patternDataUrl) {
                try {
                    const patternImg = await loadDataUrlImage(patternDataUrl);
                    fillStyle = ctx.createPattern(patternImg, 'repeat');
                } catch (e) {
                    fillStyle = '#080812';
                }
            }

            const drawPatternText = (text, x, y, size) => {
                ctx.save();
                ctx.font = `800 ${size}px Segoe UI, Arial, sans-serif`;
                ctx.textBaseline = 'top';
                ctx.lineJoin = 'round';
                ctx.shadowColor = 'rgba(0,0,0,0.72)';
                ctx.shadowBlur = 0;
                ctx.shadowOffsetX = 2;
                ctx.shadowOffsetY = 2;
                ctx.fillStyle = fillStyle;
                ctx.fillText(text, x, y);
                ctx.globalAlpha = 0.55;
                ctx.strokeStyle = 'rgba(0,0,0,0.32)';
                ctx.lineWidth = 1.1;
                ctx.strokeText(text, x, y);
                ctx.restore();
            };

            drawPatternText(title, 0, 0, 58);
            drawPatternText(dateRange, 0, 76, 58);

            drawPatternText(`Start Date: ${startDate}`, 0, 206, 34);
            drawPatternText(`End Date: ${endDate}`, 0, 254, 34);
            drawPatternText(`Format: ${formatStr}`, 0, 302, 34);

            return canvas.toDataURL('image/png');
        };

        const createPatternLabelImage = async (text, patternDataUrl, width = 760, height = 170, fontSize = 78) => {
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, width, height);

            let fillStyle = '#080812';
            if (patternDataUrl) {
                try {
                    const patternImg = await loadDataUrlImage(patternDataUrl);
                    fillStyle = ctx.createPattern(patternImg, 'repeat');
                } catch (e) {
                    fillStyle = '#080812';
                }
            }

            ctx.font = `800 ${fontSize}px Segoe UI, Arial, sans-serif`;
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'center';
            ctx.shadowColor = 'rgba(0,0,0,0.72)';
            ctx.shadowOffsetX = 2;
            ctx.shadowOffsetY = 2;
            ctx.fillStyle = fillStyle;
            ctx.fillText(text, width / 2, height / 2);
            ctx.globalAlpha = 0.55;
            ctx.strokeStyle = 'rgba(0,0,0,0.32)';
            ctx.lineWidth = 1.1;
            ctx.strokeText(text, width / 2, height / 2);

            return canvas.toDataURL('image/png');
        };

        // --- PAGE 1: COVER SLIDE ---
        let slide = pptx.addSlide();
        if (bgCoverBase64) {
            slide.addImage({ data: bgCoverBase64, x: 0, y: 0, w: 13.33, h: 7.5 });
        }
        
        // 1. Exact white rounded information panel from the reference PPT.
        slide.addShape(pptx.ShapeType.roundRect, {
            x: 1437053 / 914400,
            y: 983501 / 914400,
            w: 9382565 / 914400,
            h: 2837730 / 914400,
            fill: { color: 'FFFFFF' },
            line: { show: false }
        });

        // Helper to format subtitle date range like: Feb'26 to Apr'26
        const formatShortDate = (dateStr) => {
            try {
                const clean = dateStr.replace(/(\d+)(st|nd|rd|th)/, '$1');
                const d = new Date(clean);
                if (isNaN(d.getTime())) return dateStr;
                const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                return `${months[d.getMonth()]}'${d.getFullYear().toString().slice(-2)}`;
            } catch(err) {
                return dateStr;
            }
        };
        const startShort = formatShortDate(startDate);
        const endShort = formatShortDate(endDate);
        const coverTextImage = await createPatternTextImage({
            title,
            dateRange: `${startShort} to ${endShort}`,
            startDate,
            endDate,
            formatStr,
            patternDataUrl: textFillBase64
        });

        // 2. Text block rendered with the same image-fill style used by the reference file.
        slide.addImage({
            data: coverTextImage,
            x: 1863297 / 914400,
            y: 1233574 / 914400,
            w: 8546733 / 914400,
            h: 2339102 / 914400
        });

        // 3. Centered Billion Tags logo from the reference PPT layout.
        if (logoBase64) {
            slide.addImage({
                data: logoBase64,
                x: 3989041 / 914400,
                y: 5455562 / 914400,
                w: 3483624 / 914400,
                h: 1323778 / 914400
            });
        }
        
        const desktopImages = [];
        const mobileImages = [];

        for (const cb of checkboxes) {
            const card = cb.closest('.result-card');
            const urlText = card.querySelector('.card-url').textContent;
            const imgEl = card.querySelector('img');
            
            if (!imgEl) continue;
            
            const urlObj = new URL(imgEl.src);
            const pathParts = urlObj.pathname.split('/');
            const filename = pathParts[pathParts.length - 1];

            const response = await fetch(`${API_BASE_URL}/get-image-base64?path=${filename}`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const data = await response.json();
            if (data.error) throw new Error(data.error);
            
            const rawDataUrl = data.dataUrl;
            
            const { base64: jpegBase64, width: imgWidth, height: imgHeight } = await new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.width;
                    canvas.height = img.height;
                    const ctx = canvas.getContext('2d');
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(img, 0, 0);
                    resolve({ base64: canvas.toDataURL('image/jpeg', 0.95), width: img.width, height: img.height });
                };
                img.onerror = () => reject(new Error('Failed to process image'));
                img.src = rawDataUrl;
            });
            
            const isMobile = imgHeight > imgWidth || imgWidth < 600;
            const imgObj = { url: urlText, base64: jpegBase64, width: imgWidth, height: imgHeight };
            
            if (isMobile) mobileImages.push(imgObj);
            else desktopImages.push(imgObj);
        }        // --- DESKTOP SLIDES (1 per page) ---
        for (const img of desktopImages) {
            slide = pptx.addSlide();
            applyGradientBackground(slide); // Strictly apply gradient background for screenshot slides
            
            // White Rounded Rectangles behind text (completely borderless!)
            slide.addShape(pptx.ShapeType.roundRect, { x: 4.68/25.4, y: 5.06/25.4, w: 103.52/25.4, h: 14.03/25.4, fill: {color:'FFFFFF'}, line: { show: false } });
            slide.addShape(pptx.ShapeType.roundRect, { x: 130.32/25.4, y: 5.06/25.4, w: 88.02/25.4, h: 14.03/25.4, fill: {color:'FFFFFF'}, line: { show: false } });
            slide.addShape(pptx.ShapeType.roundRect, { x: 244.28/25.4, y: 5.06/25.4, w: 88.02/25.4, h: 14.03/25.4, fill: {color:'FFFFFF'}, line: { show: false } });
            
            drawLabelValue(slide, "Site:", img.url.length > 25 ? img.url.substring(0, 22) + "..." : img.url, 10, 14);
            drawLabelValue(slide, "Ad Size:", "Auto-detected", 136, 14);
            drawLabelValue(slide, "Device:", "Desktop", 250, 14);
            
            const maxW = 327; // mm
            const maxH = 161; // mm
            const ratio = Math.min(maxW / img.width, maxH / img.height);
            const w = img.width * ratio;
            const h = img.height * ratio;
            
            const x = 5.7 + (maxW - w) / 2;
            const y = 23.3;
            
            slide.addImage({ data: img.base64, x: x/25.4, y: y/25.4, w: w/25.4, h: h/25.4 });
        }
        
        // Helper to draw mobile labels and values using Segoe UI and borderless containers
        const drawMobileText = (slide, imgObj, x_mm, y_mm) => {
            let currentY = (y_mm - 5) / 25.4;
            const lines = [
                ["Site:", imgObj.url.length > 25 ? imgObj.url.substring(0, 22) + "..." : imgObj.url],
                ["Ad Size:", "Auto-detected"],
                ["Device:", "Mobile"]
            ];
            for (const [label, value] of lines) {
                slide.addText([
                    { text: label + " ", options: { bold: true, fontFace: 'Segoe UI', fontSize: 18, color: '1E293B' } },
                    { text: value, options: { bold: false, fontFace: 'Segoe UI', fontSize: 18, color: '000000' } }
                ], { x: x_mm/25.4, y: currentY, w: 3.5, h: 0.5, valign: 'middle' });
                currentY += 8.5 / 25.4;
            }
        };
 
        // --- MOBILE SLIDES (2 per page) ---
        for (let i = 0; i < mobileImages.length; i += 2) {
            slide = pptx.addSlide();
            applyGradientBackground(slide); // Strictly apply gradient background for screenshot slides
            
            const img1 = mobileImages[i];
            const img2 = mobileImages[i+1];
            
            const maxW = 98.7;
            const maxH = 176;
            
            // --- Image 1 (Far Left) ---
            const r1 = Math.min(maxW / img1.width, maxH / img1.height);
            const w1 = img1.width * r1;
            const h1 = img1.height * r1;
            const x1 = 7.1 + (maxW - w1) / 2;
            const y1 = 7.7 + (maxH - h1) / 2;
            slide.addImage({ data: img1.base64, x: x1/25.4, y: y1/25.4, w: w1/25.4, h: h1/25.4 });
            
            // --- Text 1 ---
            slide.addShape(pptx.ShapeType.roundRect, { x: 107.72/25.4, y: 7.29/25.4, w: 100/25.4, h: 36.65/25.4, fill: {color:'FFFFFF'}, line: { show: false } });
            drawMobileText(slide, img1, 114, 18);
            
            // --- Image 2 (Far Right) ---
            if (img2) {
                const r2 = Math.min(maxW / img2.width, maxH / img2.height);
                const w2 = img2.width * r2;
                const h2 = img2.height * r2;
                const x2 = 231 + (maxW - w2) / 2;
                const y2 = 7.7 + (maxH - h2) / 2;
                slide.addImage({ data: img2.base64, x: x2/25.4, y: y2/25.4, w: w2/25.4, h: h2/25.4 });
                
                // --- Text 2 ---
                slide.addShape(pptx.ShapeType.roundRect, { x: 107.72/25.4, y: 142.52/25.4, w: 100/25.4, h: 41.47/25.4, fill: {color:'FFFFFF'}, line: { show: false } });
                drawMobileText(slide, img2, 114, 153);
            }
        }

        const addThanksSlide = async () => {
            const thanksSlide = pptx.addSlide();
            if (bgCoverBase64) {
                thanksSlide.addImage({ data: bgCoverBase64, x: 0, y: 0, w: 13.33, h: 7.5 });
            }

            const thanksTextImage = await createPatternLabelImage('Thank You', textFillBase64);
            thanksSlide.addImage({
                data: thanksTextImage,
                x: 4831883 / 914400,
                y: 2071798 / 914400,
                w: 3041582 / 914400,
                h: 584775 / 914400
            });

            if (logoBase64) {
                thanksSlide.addImage({
                    data: logoBase64,
                    x: 4200796 / 914400,
                    y: 3200209 / 914400,
                    w: 3483624 / 914400,
                    h: 1323778 / 914400
                });
            }
        };
        
        if (desktopImages.length === 0 && mobileImages.length === 0) {
            showToast('No valid screenshots found to export', 'error');
        } else {
            await addThanksSlide();
            await pptx.writeFile({ fileName: "Creative_Scans_Report.pptx" });
            showToast('PPT Exported Successfully!');
            pptModal.style.display = 'none';
        }
    } catch (error) {
        console.error("PPT Generation Error: ", error);
        showToast(`Error generating PPT: ${error.message || 'Unknown error'}`, 'error');
    } finally {
        generatePptBtn.innerHTML = `<i class='bx bxs-file-export'></i> Generate Report`;
        generatePptBtn.disabled = false;
    }
}

// Initial fetch on load
document.addEventListener('DOMContentLoaded', () => {
    fetchResults();
    updateVPNStatus();
    // Re-check IP status every 10 seconds to keep it fresh
    setInterval(updateVPNStatus, 10000);
});

// --- VPN PROXY CONTROLLER LOGIC ---
let isVpnConnected = false;

async function updateVPNStatus() {
    try {
        const res = await fetch(`${API_BASE_URL}/api/vpn/status`);
        if (res.ok) {
            const data = await res.json();
            document.getElementById('vpn-ip-val').textContent = data.ip;
            document.getElementById('vpn-location-val').textContent = `${data.city}, ${data.country}`;
        }
    } catch(e) {
        console.warn("Could not check VPN status details", e);
    }
}

// Toggle Custom vs Country dropdown views based on selected provider
const vpnProvider = document.getElementById('vpn-provider');
if (vpnProvider) {
    vpnProvider.addEventListener('change', () => {
        const val = vpnProvider.value;
        const countryGroup = document.getElementById('vpn-country-group');
        const customGroup = document.getElementById('vpn-custom-group');
        
        if (val === 'Custom') {
            countryGroup.style.display = 'none';
            customGroup.style.display = 'block';
        } else {
            countryGroup.style.display = 'block';
            customGroup.style.display = 'none';
        }
    });
}

const vpnToggleBtn = document.getElementById('vpn-toggle-btn');
if (vpnToggleBtn) {
    vpnToggleBtn.addEventListener('click', async () => {
        const provider = document.getElementById('vpn-provider').value;
        const country = document.getElementById('vpn-country').value;
        const customCommand = document.getElementById('vpn-custom-cmd').value;
        
        const action = isVpnConnected ? 'disconnect' : 'connect';
        vpnToggleBtn.disabled = true;
        vpnToggleBtn.innerHTML = `<i class='bx bx-loader-alt bx-spin'></i> ${action === 'connect' ? 'Connecting...' : 'Disconnecting...'}`;
        
        try {
            const res = await fetch(`${API_BASE_URL}/api/vpn/toggle`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    provider: provider,
                    action: action,
                    country: country,
                    custom_command: customCommand
                })
            });
            
            const data = await res.json();
            if (data.success) {
                isVpnConnected = !isVpnConnected;
                if (isVpnConnected) {
                    vpnToggleBtn.innerHTML = `<i class='bx bx-power-off'></i> Disconnect VPN`;
                    vpnToggleBtn.style.background = 'linear-gradient(135deg, #EF4444, #DC2626)'; // Red for disconnect
                    showToast(`VPN connected successfully!`, 'success');
                } else {
                    vpnToggleBtn.innerHTML = `<i class='bx bx-power-off'></i> Connect VPN`;
                    vpnToggleBtn.style.background = 'linear-gradient(135deg, #10B981, #059669)'; // Green for connect
                    showToast(`VPN disconnected successfully!`, 'success');
                }
                // Wait slightly for routing to update, then check new IP
                setTimeout(updateVPNStatus, 2500);
            } else {
                showToast(`VPN Error: ${data.message}`, 'error');
                vpnToggleBtn.innerHTML = `<i class='bx bx-power-off'></i> ${isVpnConnected ? 'Disconnect VPN' : 'Connect VPN'}`;
            }
        } catch(err) {
            showToast(`Could not trigger VPN: ${err.message}`, 'error');
            vpnToggleBtn.innerHTML = `<i class='bx bx-power-off'></i> ${isVpnConnected ? 'Disconnect VPN' : 'Connect VPN'}`;
        } finally {
            vpnToggleBtn.disabled = false;
        }
    });
}
