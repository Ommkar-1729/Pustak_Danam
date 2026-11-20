const SUPABASE_URL = 'https://pytevaitwaplegygdrix.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_oNa-nO0YT2UeJPsPTXQW9A_kgjDxzcB';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const searchInput = document.getElementById("book-search-input");
if (searchInput) {
    searchInput.addEventListener("input", async (e) => {
        const queryVal = e.target.value.trim();
        await fetchAndRenderBooks(queryVal); // Passes "" if empty, fetching all books
    });
}

function highlightText(text, query, color) {
    if (!query || !text) return text;
    const escaped = query.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const regex = new RegExp(`(${escaped})`, 'gi');
    const bgColor = color === 'yellow' ? '#ffeb3b' : '#ffc0cb';
    return text.replace(regex, `<mark style="background-color: ${bgColor} !important; color: #000 !important; padding: 0 2px; border-radius: 2px;">$1</mark>`);
}



let currentCustomerId = "CUST-001";
let borrowedBookIds = new Set();
const customerPhoto = document.getElementById("customer-photo");
const profileInput = document.getElementById("profile-pic-input");

const backBtn = document.getElementById("back-to-login-btn");
if (backBtn) {
    backBtn.addEventListener("click", () => {
        window.location.href = "index.html";
    });
}

document.addEventListener("DOMContentLoaded", async () => {
    const urlParams = new URLSearchParams(window.location.search);
    currentCustomerId = urlParams.get("id") || "CUST-001";

    const idDisplay = document.getElementById("Customer_id_display");
    if (idDisplay) idDisplay.textContent = currentCustomerId;

    if (searchInput) searchInput.value = "";

    await fetchCustomerDetails(currentCustomerId);
    await fetchAndRenderBorrowedBooks(currentCustomerId);
    await fetchAndRenderBooks();

    supabaseClient
        .channel('library-realtime-sync')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'book' }, () => {
            fetchAndRenderBooks();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'customer' }, () => {
            fetchCustomerDetails(currentCustomerId);
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'transaction' }, () => {
            fetchAndRenderBooks();
            fetchCustomerDetails(currentCustomerId);
        })
        .subscribe();
});

async function fetchCustomerDetails(customerId) {
    try {
        const { data: customerData, error: customerError } = await supabaseClient
            .from('customer')
            .select('customer_name, email_id, contact, photo')
            .eq('customer_id', customerId)
            .single();

        if (customerError) throw customerError;

        if (customerData) {
            const idDisplay = document.getElementById("Customer_id_display");
            const nameEl = document.getElementById("customer-name");
            const emailEl = document.getElementById("customer-email");
            const phoneEl = document.getElementById("customer-phone");
            const photoEl = document.getElementById("customer-photo");

            if (idDisplay) idDisplay.textContent = customerId;
            if (nameEl) nameEl.textContent = customerData.customer_name || "N/A";
            if (emailEl) emailEl.textContent = customerData.email_id || "N/A";
            if (phoneEl) phoneEl.textContent = customerData.contact || "N/A";
            if (photoEl) photoEl.src = customerData.photo || "images/Omkar.jpeg";
        }
    } catch (err) {
        console.error("Error fetching customer details:", err.message);
    }
}

async function fetchAndRenderBorrowedBooks(customerId) {
    try {
        const { data: transactions, error: txError } = await supabaseClient
            .from('transaction')
            .select('book_id, status, borrow_date')
            .eq('customer_id', customerId)
            .eq('status', 'borrowed');

        if (txError) throw txError;

        const container = document.getElementById('borrowed-books-container');
        if (!container) return;
        container.innerHTML = '';

        borrowedBookIds.clear();

        if (!transactions || transactions.length === 0) {
            container.innerHTML = '<p style="color: #666; font-style: italic;">No books currently borrowed.</p>';
            await fetchAndRenderBooks();
            return;
        }

        const borrowDateMap = {};
        transactions.forEach(t => {
            if (t.book_id) {
                const bId = String(t.book_id).trim();
                borrowedBookIds.add(bId);
                borrowDateMap[bId] = t.borrow_date;
            }
        });

        const bookIds = Array.from(borrowedBookIds);

        const { data: books, error: bookError } = await supabaseClient
            .from('book')
            .select('*')
            .in('book_id', bookIds);

        if (bookError) throw bookError;

        books.forEach(book => {
            const card = document.createElement('div');
            card.className = 'borrowed-card';
            card.style.backgroundColor = '#ffebee'; // Light red for borrowed view
            card.style.padding = '10px';
            card.style.marginBottom = '10px';
            card.style.borderRadius = '6px';
            
            const bookIdStr = String(book.book_id).trim();
            const borrowDate = borrowDateMap[bookIdStr] || "N/A";
            
            let dueDateDisplay = "N/A";
            if (borrowDate !== "N/A") {
                const borrowDateObj = new Date(borrowDate);
                borrowDateObj.setDate(borrowDateObj.getDate() + 14);
                dueDateDisplay = borrowDateObj.toISOString().split('T')[0];
            }

            card.innerHTML = `
                <div>
                    <h4>${book.book_name}</h4>
                    <p>Author: ${book.author}</p>
                    <p>Category: ${book.category}</p>
                    <p class="book-price">Price: ₹${book.price}</p>
                    <p style="font-size: 12px; color: #333; margin-top: 6px;"><strong>Issued Date:</strong> ${borrowDate}</p>
                    <p style="font-size: 12px; color: #333;"><strong>Return Due Date:</strong> ${dueDateDisplay}</p>
                </div>
                <button disabled style="margin-top: 10px; width: 100%; padding: 6px; background-color: #e0e0e0; color: #666; border: none; border-radius: 4px; cursor: not-allowed;">
                    View Only
                </button>
            `;

            container.appendChild(card);
        });

        await fetchAndRenderBooks();

    } catch (error) {
        console.error("Error fetching borrowed books:", error.message);
    }
}

async function fetchAndRenderBooks(searchQuery = "") {
    try {
        let query = supabaseClient.from('book').select('*');

        if (searchQuery) {
            query = query.or(`book_name.ilike.%${searchQuery}%,author.ilike.%${searchQuery}%`);
        }
        
        const { data: books, error: bookError } = await query;
        if (bookError) throw bookError;

        renderBooks(books, searchQuery);

    } catch (error) {
        console.error("Error fetching library books:", error.message);
    }
}

// Track current starting index per category for pagination/sliding
const categoryOffsets = {
    english: 0,
    hindi: 0,
    gujarati: 0
};

const BOOKS_PER_VIEW = 5;

function createBookCard(book, searchQuery) {
    const card = document.createElement('div');
    card.className = 'book-card';
    card.style.backgroundColor = '#e8f5e9';
    card.style.padding = '10px';
    card.style.borderRadius = '6px';
    card.style.minWidth = '180px';
    card.style.flex = '1 1 180px';

    const displayedTitle = highlightText(book.book_name, searchQuery, 'yellow');
    const displayedAuthor = highlightText(book.author, searchQuery, 'pink');

    card.innerHTML = `
        <div>
            <h4>${displayedTitle}</h4>
            <p>Author: ${displayedAuthor}</p>
            <p>Category: ${book.category}</p>
            <p class="book-price">Price: ₹${book.price}</p>
        </div>
        <button disabled style="margin-top: 10px; width: 100%; padding: 6px; background-color: #e0e0e0; color: #666; border: none; border-radius: 4px; cursor: not-allowed;">
            View Only
        </button>
    `;
    return card;
}

function renderBooks(books, searchQuery = "") {
    const engContainer = document.getElementById('eng-books');
    const hindiContainer = document.getElementById('hindi-books');
    const gujaratiContainer = document.getElementById('guj-books');

    if (engContainer) engContainer.innerHTML = '';
    if (hindiContainer) hindiContainer.innerHTML = '';
    if (gujaratiContainer) gujaratiContainer.innerHTML = '';

    if (!books || books.length === 0) {
        if (engContainer) engContainer.innerHTML = '<p style="color: #666; font-style: italic;">No books found.</p>';
        return;
    }

    const grouped = {
        english: [],
        hindi: [],
        gujarati: []
    };

    books.forEach(book => {
        const category = String(book.category).toLowerCase().trim();
        if (category.includes('english') || category.includes('eng')) {
            grouped.english.push(book);
        } else if (category.includes('hindi') || category.includes('hin')) {
            grouped.hindi.push(book);
        } else if (category.includes('gujarati') || category.includes('guj')) {
            grouped.gujarati.push(book);
        }
    });

    function renderCategoryPanel(container, categoryKey) {
        if (!container) return;
        const list = grouped[categoryKey];

        // Remove any previous arrow toolbar right above this container
        const existingNav = container.parentNode?.querySelector(`.carousel-nav[data-cat="${categoryKey}"]`);
        if (existingNav) existingNav.remove();

        if (!list || list.length === 0) {
            container.innerHTML = '<p style="color: #666; font-style: italic;">No books found.</p>';
            return;
        }

        // Clamp offset if search/realtime update shrinks the list
        const maxStart = Math.max(0, list.length - BOOKS_PER_VIEW);
        if (categoryOffsets[categoryKey] > maxStart) {
            categoryOffsets[categoryKey] = maxStart;
        }

        // Build Left / Right arrow bar above the book panel
        const navBar = document.createElement('div');
        navBar.className = 'carousel-nav';
        navBar.dataset.cat = categoryKey;
        navBar.style.cssText = `
            display: flex;
            justify-content: flex-end;
            align-items: center;
            gap: 8px;
            margin-bottom: 8px;
        `;

        const prevBtn = document.createElement('button');
        prevBtn.type = 'button';
        prevBtn.innerHTML = '&larr;';
        prevBtn.title = 'Previous books';

        const nextBtn = document.createElement('button');
        nextBtn.type = 'button';
        nextBtn.innerHTML = '&rarr;';
        nextBtn.title = 'Next books';

        const counter = document.createElement('span');
        counter.style.cssText = 'font-size: 12px; color: #555; margin-right: 4px;';

        function updatePanelView() {
            const start = categoryOffsets[categoryKey];
            const end = Math.min(start + BOOKS_PER_VIEW, list.length);
            const slice = list.slice(start, end);

            container.innerHTML = '';
            container.style.display = 'flex';
            container.style.gap = '10px';
            container.style.flexWrap = 'wrap';

            slice.forEach(book => {
                container.appendChild(createBookCard(book, searchQuery));
            });

            counter.textContent = `${start + 1}–${end} of ${list.length}`;

            const atStart = start <= 0;
            const atEnd = end >= list.length;

            prevBtn.disabled = atStart;
            nextBtn.disabled = atEnd;

            [prevBtn, nextBtn].forEach(btn => {
                btn.style.cssText = `
                    padding: 4px 10px;
                    border: 1px solid #ccc;
                    border-radius: 4px;
                    background-color: ${btn.disabled ? '#f0f0f0' : '#ffffff'};
                    color: ${btn.disabled ? '#aaa' : '#222'};
                    cursor: ${btn.disabled ? 'not-allowed' : 'pointer'};
                    font-size: 15px;
                    font-weight: bold;
                `;
            });
        }

        prevBtn.addEventListener('click', () => {
            if (categoryOffsets[categoryKey] > 0) {
                categoryOffsets[categoryKey] = Math.max(0, categoryOffsets[categoryKey] - 1);
                updatePanelView();
            }
        });

        nextBtn.addEventListener('click', () => {
            if (categoryOffsets[categoryKey] + BOOKS_PER_VIEW < list.length) {
                categoryOffsets[categoryKey] = Math.min(
                    list.length - BOOKS_PER_VIEW,
                    categoryOffsets[categoryKey] + 1
                );
                updatePanelView();
            }
        });

        navBar.appendChild(counter);
        navBar.appendChild(prevBtn);
        navBar.appendChild(nextBtn);

        container.parentNode.insertBefore(navBar, container);
        updatePanelView();
    }

    renderCategoryPanel(engContainer, 'english');
    renderCategoryPanel(hindiContainer, 'hindi');
    renderCategoryPanel(gujaratiContainer, 'gujarati');
}










// --- Profile Picture Edit, Drag-Crop & Supabase Save ---
(function setupProfilePhotoEditor() {
    const photoImg = document.getElementById("customer-photo");
    const editBtn = document.getElementById("edit-photo-btn");
    const fileInput = document.getElementById("profile-pic-input");
    const cropModal = document.getElementById("crop-modal");
    const cropCanvas = document.getElementById("crop-canvas");
    const cancelCropBtn = document.getElementById("cancel-crop");
    const saveCropBtn = document.getElementById("save-crop");

    if (!photoImg || !fileInput || !cropModal || !cropCanvas || !cancelCropBtn || !saveCropBtn) {
        return;
    }

    const ctx = cropCanvas.getContext("2d");
    let loadedImage = null;
    let imgX = 0;
    let imgY = 0;
    let imgScale = 1;
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;

    function openFilePicker() {
        fileInput.click();
    }

    photoImg.addEventListener("click", openFilePicker);
    if (editBtn) {
        editBtn.addEventListener("click", openFilePicker);
    }

    function drawCropCanvas() {
        if (!loadedImage) return;
        const size = cropCanvas.width;
        ctx.clearRect(0, 0, size, size);
        ctx.drawImage(
            loadedImage,
            imgX,
            imgY,
            loadedImage.width * imgScale,
            loadedImage.height * imgScale
        );
    }

    function clampPosition() {
        if (!loadedImage) return;
        const size = cropCanvas.width;
        const drawnW = loadedImage.width * imgScale;
        const drawnH = loadedImage.height * imgScale;

        imgX = Math.min(0, Math.max(size - drawnW, imgX));
        imgY = Math.min(0, Math.max(size - drawnH, imgY));
    }

    fileInput.addEventListener("change", (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith("image/")) {
            alert("Please select a valid image file.");
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                loadedImage = img;
                const size = cropCanvas.width;
                // Cover the 200x200 square completely
                imgScale = Math.max(size / img.width, size / img.height);
                imgX = (size - img.width * imgScale) / 2;
                imgY = (size - img.height * imgScale) / 2;

                drawCropCanvas();
                cropModal.style.display = "flex";
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    });

    // Mouse & Touch Drag Support on Canvas
    cropCanvas.addEventListener("mousedown", (e) => {
        isDragging = true;
        dragStartX = e.clientX - imgX;
        dragStartY = e.clientY - imgY;
    });

    window.addEventListener("mousemove", (e) => {
        if (!isDragging) return;
        imgX = e.clientX - dragStartX;
        imgY = e.clientY - dragStartY;
        clampPosition();
        drawCropCanvas();
    });

    window.addEventListener("mouseup", () => {
        isDragging = false;
    });

    cropCanvas.addEventListener("touchstart", (e) => {
        if (e.touches.length !== 1) return;
        isDragging = true;
        dragStartX = e.touches[0].clientX - imgX;
        dragStartY = e.touches[0].clientY - imgY;
    }, { passive: true });

    cropCanvas.addEventListener("touchmove", (e) => {
        if (!isDragging || e.touches.length !== 1) return;
        imgX = e.touches[0].clientX - dragStartX;
        imgY = e.touches[0].clientY - dragStartY;
        clampPosition();
        drawCropCanvas();
    }, { passive: true });

    cropCanvas.addEventListener("touchend", () => {
        isDragging = false;
    });

    function closeCropModal() {
        cropModal.style.display = "none";
        fileInput.value = "";
        loadedImage = null;
    }

    cancelCropBtn.addEventListener("click", closeCropModal);

    saveCropBtn.addEventListener("click", async () => {
        if (!loadedImage) return;

        const urlParams = new URLSearchParams(window.location.search);
        const activeCustomerId =
            (typeof currentCustomerId !== "undefined" && currentCustomerId) ||
            urlParams.get("customer_id") ||
            urlParams.get("id");

        if (!activeCustomerId) {
            alert("Customer ID not found in URL.");
            return;
        }

        // Support whichever Supabase variable name customer.js uses
        const db = typeof supabaseClient !== "undefined" ? supabaseClient : supabase;

        saveCropBtn.disabled = true;
        saveCropBtn.textContent = "Saving...";

        try {
            const blob = await new Promise((resolve) =>
                cropCanvas.toBlob(resolve, "image/jpeg", 0.9)
            );
            if (!blob) throw new Error("Failed to create cropped image.");

            const filePath = `${activeCustomerId}-${Date.now()}.jpg`;

            // 1. Upload to Supabase Storage bucket 'customer-photos'
            const { error: uploadError } = await db.storage
                .from("customer-photos")
                .upload(filePath, blob, {
                    contentType: "image/jpeg",
                    upsert: true
                });

            if (uploadError) throw uploadError;

            // 2. Get public URL
            const { data: urlData } = db.storage
                .from("customer-photos")
                .getPublicUrl(filePath);

            const publicUrl = urlData?.publicUrl;
            if (!publicUrl) throw new Error("Could not retrieve public URL.");

            // 3. Save URL into customer.photo column
            const { error: updateError } = await db
                .from("customer")
                .update({ photo: publicUrl })
                .eq("customer_id", activeCustomerId);

            if (updateError) throw updateError;

            // 4. Update displayed image immediately
            photoImg.src = publicUrl;
            closeCropModal();
            alert("Profile photo saved!");
        } catch (err) {
            console.error("Error saving cropped photo:", err.message);
            alert("Failed to save photo: " + err.message);
        } finally {
            saveCropBtn.disabled = false;
            saveCropBtn.textContent = "Crop & Save";
        }
    });
})();

