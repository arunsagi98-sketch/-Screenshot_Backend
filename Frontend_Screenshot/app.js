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
exportPdfBtn.addEventListener('click', exportSelectedToPDF);

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
            chip.innerHTML = `<i class='bx bx-image'></i> ${file.name.substring(0, 15)}...`;
            uploadPreview.appendChild(chip);
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

    // Set Loading State
    const originalContent = startBtn.innerHTML;
    startBtn.innerHTML = `<i class='bx bx-loader-alt bx-spin'></i> Scanning ${urls.length} URL(s)...`;
    startBtn.disabled = true;

    try {
        const response = await fetch(`${API_BASE_URL}/process`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ urls: urls })
        });

        if (response.ok) {
            showToast('Scan completed successfully!');
            fetchResults(); // Refresh results automatically
        } else {
            showToast('Scan failed or timed out', 'error');
        }
    } catch (error) {
        console.error(error);
        showToast('Connection error. Check your backend.', 'error');
    } finally {
        // Reset Button
        startBtn.innerHTML = originalContent;
        startBtn.disabled = false;
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
    resultsCount.textContent = `${results.length} scans`;
    resultsGrid.innerHTML = '';

    if (results.length === 0) {
        resultsGrid.innerHTML = `
            <div class="empty-state">
                <i class='bx bx-history'></i>
                <p>No recent scans. Start a new scan to see results.</p>
            </div>
        `;
        return;
    }

    results.forEach(res => {
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
        
        // Helper to draw bold label and normal value
        const drawLabelValue = (slide, label, value, x_mm, y_mm) => {
            const x = x_mm / 25.4;
            const y = (y_mm - 5) / 25.4; // offset y slightly as pptxgenjs y is top of textbox
            
            // Add label and value inline
            slide.addText([
                { text: label + " ", options: { bold: true, fontFace: 'Helvetica', fontSize: 18, color: '000000' } },
                { text: value, options: { bold: false, fontFace: 'Helvetica', fontSize: 18, color: '000000' } }
            ], { x: x, y: y, w: 4, h: 0.5, valign: 'middle' });
        };
        
        // Fetch background image
        let bgBase64 = null;
        try {
            const bgResponse = await fetch(`${API_BASE_URL}/get-image-base64?path=template_bg.png`);
            if (bgResponse.ok) {
                const bgData = await bgResponse.json();
                if (!bgData.error) bgBase64 = bgData.dataUrl;
            }
        } catch (e) {
            console.warn("Could not fetch background template image.");
        }

        const applyBackground = (slide) => {
            if (bgBase64) {
                slide.background = { data: bgBase64 };
            }
        };

        // --- PAGE 1: COVER SLIDE ---
        let slide = pptx.addSlide();
        applyBackground(slide);
        
        // White rounded rectangle card
        slide.addShape(pptx.ShapeType.roundRect, {
            x: 51.7 / 25.4, y: 34.2 / 25.4, w: 235 / 25.4, h: 122 / 25.4,
            fill: { color: 'FFFFFF' }
        });
        
        // Title
        slide.addText(title, {
            x: '10%', y: 70 / 25.4, w: '80%', h: 1, align: 'center',
            bold: true, fontFace: 'Helvetica', fontSize: 30, color: '000000'
        });
        
        // Sub-details
        slide.addText(`Start Date: ${startDate}`, { x: '10%', y: 100 / 25.4, w: '80%', h: 0.5, align: 'center', fontSize: 18, fontFace: 'Helvetica' });
        slide.addText(`End Date: ${endDate}`, { x: '10%', y: 110 / 25.4, w: '80%', h: 0.5, align: 'center', fontSize: 18, fontFace: 'Helvetica' });
        slide.addText(`Format: ${formatStr}`, { x: '10%', y: 120 / 25.4, w: '80%', h: 0.5, align: 'center', fontSize: 18, fontFace: 'Helvetica' });
        
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
        }
        
        // --- DESKTOP SLIDES (1 per page) ---
        for (const img of desktopImages) {
            slide = pptx.addSlide();
            applyBackground(slide);
            
            // White Rounded Rectangles behind text
            slide.addShape(pptx.ShapeType.roundRect, { x: 4.68/25.4, y: 5.06/25.4, w: 103.52/25.4, h: 14.03/25.4, fill: {color:'FFFFFF'} });
            slide.addShape(pptx.ShapeType.roundRect, { x: 130.32/25.4, y: 5.06/25.4, w: 88.02/25.4, h: 14.03/25.4, fill: {color:'FFFFFF'} });
            slide.addShape(pptx.ShapeType.roundRect, { x: 244.28/25.4, y: 5.06/25.4, w: 88.02/25.4, h: 14.03/25.4, fill: {color:'FFFFFF'} });
            
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
        
        const drawMobileText = (slide, imgObj, x_mm, y_mm) => {
            let currentY = (y_mm - 5) / 25.4;
            const lines = [
                ["Site:", imgObj.url.length > 25 ? imgObj.url.substring(0, 22) + "..." : imgObj.url],
                ["Ad Size:", "Auto-detected"],
                ["Device:", "Mobile"]
            ];
            for (const [label, value] of lines) {
                slide.addText([
                    { text: label + " ", options: { bold: true, fontFace: 'Helvetica', fontSize: 18, color: '000000' } },
                    { text: value, options: { bold: false, fontFace: 'Helvetica', fontSize: 18, color: '000000' } }
                ], { x: x_mm/25.4, y: currentY, w: 3.5, h: 0.5, valign: 'middle' });
                currentY += 8.5 / 25.4;
            }
        };

        // --- MOBILE SLIDES (2 per page) ---
        for (let i = 0; i < mobileImages.length; i += 2) {
            slide = pptx.addSlide();
            applyBackground(slide);
            
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
            slide.addShape(pptx.ShapeType.roundRect, { x: 107.72/25.4, y: 7.29/25.4, w: 100/25.4, h: 36.65/25.4, fill: {color:'FFFFFF'} });
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
                slide.addShape(pptx.ShapeType.roundRect, { x: 107.72/25.4, y: 142.52/25.4, w: 100/25.4, h: 41.47/25.4, fill: {color:'FFFFFF'} });
                drawMobileText(slide, img2, 114, 153);
            }
        }
        
        if (desktopImages.length === 0 && mobileImages.length === 0) {
            showToast('No valid screenshots found to export', 'error');
        } else {
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
document.addEventListener('DOMContentLoaded', fetchResults);

