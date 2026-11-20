const SUPABASE_URL = 'https://pytevaitwaplegygdrix.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_oNa-nO0YT2UeJPsPTXQW9A_kgjDxzcB';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentCustomerId = "";
let borrowedBookIds = new Set();

const searchInput = document.getElementById("book-search-input");

function getSearchQuery() {
    return searchInput ? searchInput.value.trim() : "";
}

if (searchInput) {
    searchInput.addEventListener("input", async (e) => {
        const queryVal = e.target.value.trim();
        await fetchAndRenderBooks(queryVal);
    });
}

function highlightText(text, query, color) {
    if (!query || !text) return text;
    const escaped = query.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const regex = new RegExp(`(${escaped})`, 'gi');
    const bgColor = color === 'yellow' ? '#ffeb3b' : '#ffc0cb';
    return String(text).replace(
        regex,
        `<mark style="background-color: ${bgColor} !important; color: #000 !important; padding: 0 2px; border-radius: 2px;">$1</mark>`
    );
}

const backBtn = document.getElementById("back-to-login-btn");
if (backBtn) {
    backBtn.addEventListener("click", () => {
        window.location.href = "index.html";
    });
}

document.addEventListener("DOMContentLoaded", async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const urlCustomerId = urlParams.get("customer_id");

    const customerIdDisplay = document.getElementById("Customer_id_display");

    if (!urlCustomerId || !urlCustomerId.trim()) {
        currentCustomerId = "";
        displayNoData();
        if (customerIdDisplay) {
            customerIdDisplay.textContent = "Select a Customer ID above";
        }
        await fetchAndRenderBooks("");
        return;
    }

    // Assign to outer currentCustomerId (no shadowing)
    currentCustomerId = urlCustomerId.trim();

    if (customerIdDisplay) {
        customerIdDisplay.textContent = currentCustomerId;
    }

    if (searchInput) {
        searchInput.value = "";
    }

    await fetchCustomerDetails(currentCustomerId);
    await fetchAndRenderBorrowedBooks(currentCustomerId);
    await fetchAndRenderBooks("");

    supabaseClient
        .channel('library-realtime-sync')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'book' }, () => {
            fetchAndRenderBooks(getSearchQuery());
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'customer' }, () => {
            if (currentCustomerId) {
                fetchCustomerDetails(currentCustomerId);
            }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'transaction' }, () => {
            fetchAndRenderBooks(getSearchQuery());
            if (currentCustomerId) {
                fetchCustomerDetails(currentCustomerId);
                fetchAndRenderBorrowedBooks(currentCustomerId);
            }
        })
        .subscribe((status) => {
            console.log("Realtime subscription status:", status);
        });
});

function renderCustomer(customer, customerId) {
    if (!customer) return;

    const idEl = document.getElementById("Customer_id_display");
    const nameEl = document.getElementById("customer-name");
    const emailEl = document.getElementById("customer-email");
    const phoneEl = document.getElementById("customer-phone");
    const photoEl = document.getElementById("customer-photo");

    if (idEl && customerId) idEl.textContent = customerId;
    if (nameEl) nameEl.textContent = customer.customer_name || "N/A";
    if (emailEl) emailEl.textContent = customer.email_id || "N/A";
    if (phoneEl) phoneEl.textContent = customer.contact || "N/A";
    if (photoEl) photoEl.src = customer.photo || "images/Omkar.jpeg";
}

function displayNoData() {
    const idEl = document.getElementById("Customer_id_display");
    const nameEl = document.getElementById("customer-name");
    const emailEl = document.getElementById("customer-email");
    const phoneEl = document.getElementById("customer-phone");
    const photoEl = document.getElementById("customer-photo");
    const borrowedContainer = document.getElementById("borrowed-books-container");

    if (idEl) idEl.textContent = "No data found";
    if (nameEl) nameEl.textContent = "No data found";
    if (emailEl) emailEl.textContent = "No data found";
    if (phoneEl) phoneEl.textContent = "No data found";
    if (photoEl) photoEl.src = "images/Omkar.jpeg";
    if (borrowedContainer) {
        borrowedContainer.innerHTML = '<p style="color: #666; font-style: italic;">No active customer selected.</p>';
    }
}

async function fetchCustomerDetails(customerId) {
    try {
        const { data: customerData, error: customerError } = await supabaseClient
            .from('customer')
            .select('customer_name, email_id, contact, photo')
            .eq('customer_id', customerId)
            .single();

        if (customerError) throw customerError;

        if (customerData) {
            renderCustomer(customerData, customerId);
        } else {
            displayNoData();
        }
    } catch (err) {
        console.error("Error fetching customer details:", err.message);
        displayNoData();
    }
}

let isRenderingBorrowedBooks = false;
let pendingBorrowedCustomerId = null;
async function fetchAndRenderBorrowedBooks(customerId) {
   if (!customerId) return;

if (isRenderingBorrowedBooks) {
    pendingBorrowedCustomerId = customerId;
    return;
}

isRenderingBorrowedBooks = true;
    try {
        const container = document.getElementById('borrowed-books-container');
        if (!container) return;

        if (!customerId) {
            container.innerHTML = '<p style="color: #666; font-style: italic;">No active customer selected.</p>';
            return;
        }

        const { data: transactions, error: txError } = await supabaseClient
            .from('transaction')
            .select('book_id, status, borrow_date')
            .eq('customer_id', customerId)
            .eq('status', 'borrowed');

        if (txError) throw txError;

        container.innerHTML = '';
        borrowedBookIds.clear();

        if (!transactions || transactions.length === 0) {
            container.innerHTML = '<p style="color: #666; font-style: italic;">No books currently borrowed.</p>';
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
                <button class="return-btn" type="button" style="margin-top: 10px; width: 100%; padding: 6px; background-color: #d9534f; color: white; border: none; border-radius: 4px; cursor: pointer;">
                    Return Book
                </button>
            `;

            const returnBtn = card.querySelector('.return-btn');
            returnBtn.addEventListener('click', async () => {
                await returnBook(customerId, book.book_id);
            });

            container.appendChild(card);
        });
    } catch (error) {
        console.error("Error fetching borrowed books:", error.message);
    }
     finally {
    isRenderingBorrowedBooks = false;
    if (pendingBorrowedCustomerId) {
        const nextId = pendingBorrowedCustomerId;
        pendingBorrowedCustomerId = null;
        await fetchAndRenderBorrowedBooks(nextId);
    }
}
}

async function returnBook(customerId, bookId) {
    try {
        const confirmed = confirm("Are you sure you want to return this book?");
        if (!confirmed) return;

        const currentDate = new Date().toISOString().split('T')[0];
        const numericBookId = parseInt(bookId, 10);

        const { data, error } = await supabaseClient
            .from('transaction')
            .update({
                status: 'returned',
                return_date: currentDate
            })
            .eq('customer_id', customerId)
            .eq('book_id', numericBookId)
            .eq('status', 'borrowed')
            .select();

        if (error) throw error;

        if (!data || data.length === 0) {
            alert("Error: No matching active transaction found in Supabase to return.");
            return;
        }

        alert("Book returned successfully!");
        await fetchAndRenderBorrowedBooks(customerId);
        await fetchAndRenderBooks(getSearchQuery());
    } catch (error) {
        console.error("Error returning book:", error.message);
        alert("Failed to return the book. Check console for details.");
    }
}

async function fetchAndRenderBooks(searchQuery = getSearchQuery()) {
    try {
        let query = supabaseClient.from('book').select('*');

        if (searchQuery) {
            query = query.or(`book_name.ilike.%${searchQuery}%,author.ilike.%${searchQuery}%`);
        }

        const { data: books, error: bookError } = await query;
        if (bookError) throw bookError;

        const { data: activeTransactions, error: txError } = await supabaseClient
            .from('transaction')
            .select('book_id')
            .eq('status', 'borrowed');

        if (txError) throw txError;

        const activeBorrowedIds = new Set();
        if (activeTransactions) {
            activeTransactions.forEach(t => {
                if (t.book_id) {
                    activeBorrowedIds.add(String(t.book_id).trim());
                }
            });
        }

        const availableBooks = books.filter(book => {
            const currentBookId = String(book.book_id).trim();
            return !activeBorrowedIds.has(currentBookId);
        });

        renderBooks(availableBooks, searchQuery);
    } catch (error) {
        console.error("Error fetching library books:", error.message);
    }
}

async function borrowBook(customerId, bookId) {
    try {
        if (!customerId) {
            alert("Please enter and set an active Customer ID before borrowing a book.");
            return;
        }

        const confirmed = confirm("Are you sure you want to borrow this book?");
        if (!confirmed) return;

        const { data: currentTransactions, error: countError } = await supabaseClient
            .from('transaction')
            .select('book_id')
            .eq('customer_id', customerId)
            .eq('status', 'borrowed');

        if (countError) throw countError;

        if (currentTransactions && currentTransactions.length >= 2) {
            alert("Limit reached! You cannot borrow more than 2 books at a time. Please return a book first.");
            return;
        }

        const currentDate = new Date().toISOString().split('T')[0];

        const { error: insertError } = await supabaseClient
            .from('transaction')
            .insert([
                {
                    customer_id: customerId,
                    book_id: bookId,
                    status: 'borrowed',
                    borrow_date: currentDate
                }
            ]);

        if (insertError) throw insertError;

        alert("Book borrowed successfully!");
        await fetchAndRenderBorrowedBooks(customerId);
        await fetchAndRenderBooks(getSearchQuery());
    } catch (error) {
        console.error("Error borrowing book:", error.message);
        alert("Failed to borrow the book. Check console for details.");
    }
}

// Track current starting index per category for sliding through books
const categoryOffsets = {
    english: 0,
    hindi: 0,
    gujarati: 0
};

const BOOKS_PER_VIEW = 5;

function createBorrowBookCard(book, searchQuery) {
    const card = document.createElement('div');
    card.className = 'book-card';
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
        <button class="borrow-btn" type="button" style="margin-top: 10px; width: 100%; padding: 6px; background-color: #0275d8; color: white; border: none; border-radius: 4px; cursor: pointer;">
            Borrow Book
        </button>
    `;

    const borrowBtn = card.querySelector('.borrow-btn');
    borrowBtn.addEventListener('click', async () => {
        await borrowBook(currentCustomerId, book.book_id);
    });

    return card;
}

function renderBooks(books, searchQuery = typeof getSearchQuery === 'function' ? getSearchQuery() : "") {
    const engContainer = document.getElementById('eng-books');
    const hindiContainer = document.getElementById('hindi-books');
    const gujaratiContainer = document.getElementById('guj-books');

    if (engContainer) engContainer.innerHTML = '';
    if (hindiContainer) hindiContainer.innerHTML = '';
    if (gujaratiContainer) gujaratiContainer.innerHTML = '';

    if (!books || books.length === 0) {
        if (engContainer) {
            engContainer.innerHTML = '<p style="color: #666; font-style: italic;">No available books.</p>';
        }
        return;
    }

    const grouped = {
        english: [],
        hindi: [],
        gujarati: []
    };

    books.forEach(book => {
        const category = String(book.category || '').toLowerCase().trim();
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

        // Remove any previous arrow bar above this container
        const existingNav = container.parentNode?.querySelector(`.carousel-nav[data-cat="${categoryKey}"]`);
        if (existingNav) existingNav.remove();

        if (!list || list.length === 0) {
            container.innerHTML = '<p style="color: #666; font-style: italic;">No available books.</p>';
            return;
        }

        // Keep offset within valid bounds if list shrinks
        const maxStart = Math.max(0, list.length - BOOKS_PER_VIEW);
        if (categoryOffsets[categoryKey] > maxStart) {
            categoryOffsets[categoryKey] = maxStart;
        }

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
                container.appendChild(createBorrowBookCard(book, searchQuery));
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
