document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    initNavbar();
    initReveal();
    initFloatingFields();
    initAuthForms();
    initHomePage();
    initPredictPage();
    initHistoryPage();
    initProfilePage();
});

function pageId() {
    return document.body.dataset.page || "";
}

function formatDateTimeDisplay(value) {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) return "";

    const dd = String(date.getDate()).padStart(2, "0");
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const yyyy = date.getFullYear();
    const hh = String(date.getHours()).padStart(2, "0");
    const min = String(date.getMinutes()).padStart(2, "0");
    const sec = String(date.getSeconds()).padStart(2, "0");

    return `${dd}-${mm}-${yyyy} ${hh}:${min}:${sec}`;
}

function prefersReducedMotion() {
    return (
        localStorage.getItem("reduceMotion") === "true" ||
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
}

function initTheme() {
    const html = document.documentElement;
    const toggles = Array.from(document.querySelectorAll("#themeToggle, [data-theme-toggle]"));
    const icons = Array.from(document.querySelectorAll("[data-theme-icon]"));

    const applyTheme = (theme) => {
        html.setAttribute("data-theme", theme);
        localStorage.setItem("theme", theme);
        icons.forEach((icon) => {
            icon.className = theme === "dark" ? "fa-solid fa-sun" : "fa-solid fa-moon";
        });
    };

    applyTheme(html.getAttribute("data-theme") || "dark");

    toggles.forEach((toggle) => {
        toggle.addEventListener("click", () => {
            const next = html.getAttribute("data-theme") === "dark" ? "light" : "dark";
            applyTheme(next);
        });
    });
}

function initNavbar() {
    const nav = document.querySelector(".app-nav");
    const menuToggle = document.getElementById("menuToggle");
    const mobilePanel = document.getElementById("mobileNavPanel");
    const trigger = document.getElementById("userMenuTrigger");
    const dropdown = document.getElementById("userDropdown");

    if (nav) {
        window.addEventListener("scroll", () => {
            nav.classList.toggle("nav-scrolled", window.scrollY > 10);
        });
    }

    if (menuToggle && mobilePanel) {
        menuToggle.addEventListener("click", () => {
            const expanded = menuToggle.getAttribute("aria-expanded") === "true";
            menuToggle.setAttribute("aria-expanded", String(!expanded));
            mobilePanel.classList.toggle("open");
        });
    }

    if (trigger && dropdown) {
        trigger.addEventListener("click", () => {
            const expanded = trigger.getAttribute("aria-expanded") === "true";
            trigger.setAttribute("aria-expanded", String(!expanded));
            dropdown.classList.toggle("open");
        });

        document.addEventListener("click", (event) => {
            const target = event.target;
            if (!trigger.contains(target) && !dropdown.contains(target)) {
                trigger.setAttribute("aria-expanded", "false");
                dropdown.classList.remove("open");
            }
        });
    }
}

function initReveal() {
    const nodes = Array.from(document.querySelectorAll(".reveal"));
    if (!nodes.length) return;

    if (prefersReducedMotion() || !("IntersectionObserver" in window)) {
        nodes.forEach((node) => node.classList.add("visible"));
        return;
    }

    const observer = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                entry.target.classList.add("visible");
                observer.unobserve(entry.target);
            });
        },
        { threshold: 0.16 }
    );

    nodes.forEach((node) => observer.observe(node));
}

function initFloatingFields() {
    document
        .querySelectorAll(".field-group input, .field-group textarea, .field-group select")
        .forEach((input) => {
            const sync = () => {
                const group = input.closest(".field-group");
                if (!group) return;
                group.classList.toggle("has-value", String(input.value || "").trim().length > 0);
            };

            sync();
            input.addEventListener("input", sync);
            input.addEventListener("change", sync);
        });
}

function initAuthForms() {
    setupPasswordToggles();

    const signinForm = document.getElementById("signinForm");
    if (signinForm) {
        signinForm.addEventListener("submit", (event) => {
            let valid = true;
            valid = validateEmail("email") && valid;
            valid = validateRequired("password", "Password is required.") && valid;
            if (!valid) event.preventDefault();
        });
    }

    const signupForm = document.getElementById("signupForm");
    if (signupForm) {
        signupForm.addEventListener("submit", (event) => {
            let valid = true;
            valid = validateRequired("username", "Full Name is required.") && valid;
            valid = validateEmail("email") && valid;
            valid = validatePassword("password") && valid;
            valid = validateConfirmPassword("password", "confirm_password") && valid;
            valid = validateCheckbox("acceptTerms", "Please agree to Terms & Privacy.") && valid;
            if (!valid) event.preventDefault();
        });

        const password = document.getElementById("password");
        const fill = document.getElementById("passwordStrengthFill");
        const hint = document.getElementById("passwordStrengthHint");
        if (password && fill && hint) {
            password.addEventListener("input", () => {
                const value = password.value;
                const hasLength = value.length >= 8;
                const hasUpper = /[A-Z]/.test(value);
                const hasLower = /[a-z]/.test(value);
                const hasNumber = /\d/.test(value);
                const hasSpecial = /[^A-Za-z0-9]/.test(value);
                const score = [hasLength, hasUpper, hasLower, hasNumber, hasSpecial].filter(Boolean).length;

                if (!value.length) {
                    fill.style.width = "0%";
                    fill.className = "password-strength__fill";
                    hint.textContent = "Use 8+ chars with upper, lower, number, and symbol.";
                    return;
                }
                if (score <= 2) {
                    fill.style.width = "35%";
                    fill.className = "password-strength__fill";
                    hint.textContent = "Weak password.";
                } else if (score <= 4) {
                    fill.style.width = "68%";
                    fill.className = "password-strength__fill medium";
                    hint.textContent = "Good, add one more rule for strong strength.";
                } else {
                    fill.style.width = "100%";
                    fill.className = "password-strength__fill strong";
                    hint.textContent = "Strong password.";
                }
            });
        }
    }
}

function setupPasswordToggles() {
    document.querySelectorAll("[data-toggle-password]").forEach((button) => {
        button.addEventListener("click", () => {
            const targetId = button.getAttribute("data-toggle-password");
            const input = document.getElementById(targetId || "");
            if (!input) return;
            const hidden = input.type === "password";
            input.type = hidden ? "text" : "password";
            button.innerHTML = hidden
                ? '<i class="fa-regular fa-eye-slash"></i>'
                : '<i class="fa-regular fa-eye"></i>';
        });
    });
}

function setFieldError(id, message) {
    const hint = document.querySelector(`[data-error-for="${id}"]`);
    if (!hint) return;
    hint.textContent = message;
    hint.classList.toggle("error", Boolean(message));
}

function validateRequired(id, message) {
    const input = document.getElementById(id);
    if (!input) return true;
    const ok = Boolean(input.value && input.value.trim());
    setFieldError(id, ok ? "" : message);
    return ok;
}

function validateEmail(id) {
    const input = document.getElementById(id);
    if (!input) return true;
    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value.trim());
    setFieldError(id, ok ? "" : "Enter a valid email address.");
    return ok;
}

function validatePassword(id) {
    const input = document.getElementById(id);
    if (!input) return true;
    const value = input.value;
    const ok =
        value.length >= 8 &&
        /[A-Z]/.test(value) &&
        /[a-z]/.test(value) &&
        /\d/.test(value) &&
        /[^A-Za-z0-9]/.test(value) &&
        !/\s/.test(value);
    setFieldError(id, ok ? "" : "Use 8+ chars with upper, lower, number, symbol, and no spaces.");
    return ok;
}

function validateConfirmPassword(passwordId, confirmId) {
    const password = document.getElementById(passwordId);
    const confirm = document.getElementById(confirmId);
    if (!password || !confirm) return true;
    const ok = password.value === confirm.value;
    setFieldError(confirmId, ok ? "" : "Passwords do not match.");
    return ok;
}

function validateCheckbox(id, message) {
    const input = document.getElementById(id);
    if (!input) return true;
    const ok = Boolean(input.checked);
    setFieldError(id, ok ? "" : message);
    return ok;
}

function getRiskLevel(probability) {
    if (probability >= 70) return "high";
    if (probability >= 40) return "medium";
    return "low";
}

function riskLabel(level) {
    if (level === "high") return "High Risk";
    if (level === "medium") return "Medium Risk";
    return "Low Risk";
}

function initPredictPage() {
    if (pageId() !== "predict") return;

    document.querySelectorAll(".toggle-pill").forEach((toggle) => {
        const inputId = toggle.getAttribute("data-toggle-value");
        const input = inputId ? document.getElementById(inputId) : null;
        if (!input) return;

        const choices = Array.from(toggle.querySelectorAll(".toggle-choice"));
        const sync = () => {
            const state = input.value === "0" ? "0" : "1";
            toggle.setAttribute("data-state", state);
            choices.forEach((choice) => {
                const selected = choice.dataset.choice === state;
                choice.setAttribute("aria-pressed", selected ? "true" : "false");
            });
        };

        sync();
        choices.forEach((choice) => {
            choice.addEventListener("click", () => {
                input.value = choice.dataset.choice === "0" ? "0" : "1";
                sync();
            });
        });
    });

    const form = document.getElementById("predictForm");
    if (form) {
        form.addEventListener("submit", () => {
            const payload = {
                CreditScore: Number(document.getElementById("creditScore")?.value || 0),
                Age: Number(document.getElementById("age")?.value || 0),
                Tenure: Number(document.getElementById("tenure")?.value || 0),
                Balance: Number(document.getElementById("balance")?.value || 0),
                HasCrCard: Number(document.getElementById("hasCrCardVal")?.value || 0),
                IsActiveMember: Number(document.getElementById("isActiveMemberVal")?.value || 0),
                EstimatedSalary: Number(document.getElementById("estimatedSalary")?.value || 0),
            };
            localStorage.setItem("pendingPredictionPayload", JSON.stringify(payload));
        });
    }

    const panel = document.getElementById("resultPanel");
    if (!panel) return;

    const hasResult = Boolean(panel.dataset.prediction);
    const probability = Number(panel.dataset.probability || 0);

    animatePredictionCount();
    if (!hasResult || Number.isNaN(probability)) return;

    const level = getRiskLevel(probability);
    const badge = document.getElementById("riskLevelBadge");
    if (badge) {
        badge.className = `badge ${level}`;
        badge.textContent = riskLabel(level);
    }

    const gauge = document.getElementById("probabilityGauge");
    if (gauge) {
        gauge.style.setProperty("--gauge-value", `${Math.min(100, Math.max(0, probability))}%`);
    }

    animateProbability(probability);
    renderInfluenceAndActions(probability);
    showToast("Saved to history.");
}

function animatePredictionCount() {
    const volume = document.getElementById("resultVolume");
    const fill = document.getElementById("predictionCountFill");
    if (!volume || !fill) return;

    const count = Number(volume.dataset.count || 0);
    const percent = Math.min(100, Math.max(0, count));
    requestAnimationFrame(() => {
        fill.style.width = `${percent}%`;
    });
}

function animateProbability(probability) {
    const fill = document.getElementById("probabilityFill");
    if (!fill) return;
    requestAnimationFrame(() => {
        fill.style.width = `${Math.min(100, Math.max(0, probability))}%`;
    });
}

function renderInfluenceAndActions(probability) {
    const influenceList = document.getElementById("influenceList");
    const actionCards = document.getElementById("actionCards");
    if (!influenceList || !actionCards) return;

    const payloadRaw = localStorage.getItem("pendingPredictionPayload");
    let payload = null;
    try {
        payload = payloadRaw ? JSON.parse(payloadRaw) : null;
    } catch {
        payload = null;
    }

    const reasons = [];
    const actions = [];

    if (payload) {
        if (payload.IsActiveMember === 0) reasons.push("Low recent account activity increased churn propensity.");
        if (payload.CreditScore < 500) reasons.push("Credit score profile lowered expected retention confidence.");
        if (payload.Tenure <= 2) reasons.push("Short relationship tenure indicated lower loyalty maturity.");
        if (payload.Balance > 100000) reasons.push("High balance profile can signal active competitive offers exposure.");
        if (payload.HasCrCard === 0) reasons.push("No linked card reduced cross-product relationship depth.");
    }

    if (probability >= 70) {
        actions.push("Trigger priority outbound call from retention manager.");
        actions.push("Offer premium fee waiver or loyalty benefit package.");
        actions.push("Initiate account health check within 24 hours.");
    } else if (probability >= 40) {
        actions.push("Send personalized engagement campaign based on recent behavior.");
        actions.push("Schedule advisor follow-up for value-plan optimization.");
        actions.push("Monitor next-cycle activity for escalation signals.");
    } else {
        actions.push("Monitor this customer regularly.");
        actions.push("Offer bundled banking products to increase engagement.");
        actions.push("Watch for behavior changes that may indicate churn risk.");
    }

    if (!reasons.length) {
        reasons.push("Model considered score, activity, tenure, account balance, and card relationship.");
    }

    influenceList.innerHTML = reasons
        .slice(0, 5)
        .map((item) => `<li>${item}</li>`)
        .join("");

    actionCards.innerHTML = actions
        .slice(0, 5)
        .map((item) => `<article class="action-card">${item}</article>`)
        .join("");
}

function initHistoryPage() {
    if (pageId() !== "history") return;

    const searchInput = document.getElementById("historySearch");
    const sortInput = document.getElementById("historySort");
    const chips = Array.from(document.querySelectorAll("#historyFilterChips .chip"));
    const tbody = document.querySelector("#historyTable tbody");
    const empty = document.getElementById("historyEmpty");
    const exportBtn = document.getElementById("exportCsvBtn");

    const modal = document.getElementById("historyModal");
    const modalBody = document.getElementById("historyModalBody");
    const closeModal = document.getElementById("closeHistoryModal");

    const node = document.getElementById("historyData");
    let rows = [];
    try {
        rows = JSON.parse(node?.textContent || "[]");
    } catch {
        rows = [];
    }

    let activeFilter = "all";

    const classify = (row) => {
        const probability = Number(row.probability || 0);
        const level = getRiskLevel(probability);
        const prediction = String(row.prediction || "").toLowerCase().includes("churn") ? "Yes" : "No";
        return { probability, level, prediction };
    };

    const sortedRows = (inputRows, mode) => {
        const copy = [...inputRows];
        if (mode === "oldest") return copy.sort((a, b) => new Date(a.date) - new Date(b.date));
        if (mode === "highrisk") return copy.sort((a, b) => Number(b.probability) - Number(a.probability));
        return copy.sort((a, b) => new Date(b.date) - new Date(a.date));
    };

    const openDetails = (row) => {
        if (!modal || !modalBody) return;
        const { probability, level, prediction } = classify(row);

        const reasons = [];
        const recommendations = [];

        if (Number(row.IsActiveMember) === 0) reasons.push("Inactive membership pattern influenced score.");
        if (Number(row.CreditScore) < 500) reasons.push("Lower credit score contributed to risk weighting.");
        if (Number(row.Balance) > 100000) reasons.push("High retained balance can indicate competitive switching exposure.");
        if (Number(row.Tenure) < 3) reasons.push("Lower tenure may reduce long-term loyalty confidence.");
        if (!reasons.length) reasons.push("Score derived from combined profile and account behavior signals.");

        if (level === "high") {
            recommendations.push("Immediate retention outreach and account review.");
            recommendations.push("Offer tailored benefits to stabilize relationship.");
        } else if (level === "medium") {
            recommendations.push("Proactive engagement with targeted cross-sell journey.");
        } else {
            recommendations.push("Continue monitoring and maintain value communication cadence.");
        }

        modalBody.innerHTML = `
            <div class="modal-section">
                <h4>Prediction Summary</h4>
                <p>Prediction: <strong>${prediction}</strong></p>
                <p>Probability: <strong>${probability.toFixed(2)}%</strong></p>
                <p>Risk level: <strong>${riskLabel(level)}</strong></p>
            </div>
            <div class="modal-section">
                <h4>Data Used</h4>
                <p>CreditScore: ${row.CreditScore}, Age: ${row.Age}, Tenure: ${row.Tenure}, Balance: ${Number(row.Balance || 0).toLocaleString()}</p>
                <p>HasCrCard: ${Number(row.HasCrCard) === 1 ? "Yes" : "No"}, IsActiveMember: ${Number(row.IsActiveMember) === 1 ? "Yes" : "No"}, EstimatedSalary: ${Number(row.EstimatedSalary || 0).toLocaleString()}</p>
            </div>
            <div class="modal-section">
                <h4>Top Reasons</h4>
                <ul>${reasons.map((item) => `<li>${item}</li>`).join("")}</ul>
            </div>
            <div class="modal-section">
                <h4>Recommended Actions</h4>
                <ul>${recommendations.map((item) => `<li>${item}</li>`).join("")}</ul>
            </div>
        `;

        modal.classList.add("show");
        modal.setAttribute("aria-hidden", "false");
    };

    const closeDetails = () => {
        if (!modal) return;
        modal.classList.remove("show");
        modal.setAttribute("aria-hidden", "true");
    };

    const render = () => {
        const q = (searchInput?.value || "").trim().toLowerCase();
        const sortMode = sortInput?.value || "latest";

        let filtered = rows.filter((row) => {
            const { level } = classify(row);
            const text = `${row.CreditScore} ${row.Age} ${row.Balance} ${row.prediction} ${row.probability}`.toLowerCase();
            const matchText = !q || text.includes(q);
            const matchFilter = activeFilter === "all" || level === activeFilter;
            return matchText && matchFilter;
        });

        filtered = sortedRows(filtered, sortMode);

        if (tbody) {
            tbody.innerHTML = filtered
                .map((row, idx) => {
                    const { probability, level, prediction } = classify(row);
                    return `
                        <tr>
                            <td>${row.date_display || formatDateTimeDisplay(row.date)}</td>
                            <td>
                                <div class="row-meta">
                                    <strong>Score ${row.CreditScore} | Age ${row.Age}</strong>
                                    <small>Tenure ${row.Tenure}y, Active ${Number(row.IsActiveMember) === 1 ? "Yes" : "No"}</small>
                                </div>
                            </td>
                            <td><span class="badge ${prediction === "Yes" ? "high" : "low"}">${prediction}</span></td>
                            <td>${probability.toFixed(2)}%</td>
                            <td><span class="badge ${level}">${riskLabel(level)}</span></td>
                            <td><button class="btn btn-outline btn-sm" data-row-index="${idx}" type="button">View details</button></td>
                        </tr>
                    `;
                })
                .join("");

            tbody.querySelectorAll("[data-row-index]").forEach((button) => {
                button.addEventListener("click", () => {
                    const index = Number(button.getAttribute("data-row-index"));
                    const row = filtered[index];
                    if (row) openDetails(row);
                });
            });
        }

        if (empty) {
            empty.style.display = filtered.length ? "none" : "block";
        }
    };

    chips.forEach((chip) => {
        chip.addEventListener("click", () => {
            chips.forEach((c) => c.classList.remove("active"));
            chip.classList.add("active");
            activeFilter = chip.dataset.filter || "all";
            render();
        });
    });

    if (searchInput) searchInput.addEventListener("input", render);
    if (sortInput) sortInput.addEventListener("change", render);

    if (exportBtn) {
        exportBtn.addEventListener("click", () => {
            if (!rows.length) {
                showToast("No history rows available for export.");
                return;
            }
            exportCsv(rows);
            showToast("CSV export generated.");
        });
    }

    if (closeModal) closeModal.addEventListener("click", closeDetails);
    if (modal) {
        modal.addEventListener("click", (event) => {
            if (event.target === modal) closeDetails();
        });
    }

    render();
}

function initHomePage() {
    if (pageId() !== "home") return;

    document.querySelectorAll(".accordion-trigger").forEach((trigger) => {
        trigger.addEventListener("click", () => {
            const parent = trigger.closest(".accordion-item");
            if (!parent) return;
            const wasOpen = parent.classList.contains("open");

            document.querySelectorAll(".accordion-item.open").forEach((item) => {
                item.classList.remove("open");
                const btn = item.querySelector(".accordion-trigger");
                if (btn) btn.setAttribute("aria-expanded", "false");
            });

            if (!wasOpen) {
                parent.classList.add("open");
                trigger.setAttribute("aria-expanded", "true");
            }
        });
    });

    const contactForm = document.getElementById("contactForm");
    if (contactForm) {
        contactForm.addEventListener("submit", (event) => {
            event.preventDefault();
            showToast("Thanks. Your message has been sent successfully.");
            contactForm.reset();
            initFloatingFields();
        });
    }
}

function initProfilePage() {
    if (pageId() !== "profile") return;

    const parseJson = (id, fallback) => {
        const node = document.getElementById(id);
        if (!node) return fallback;
        try {
            return JSON.parse(node.textContent || "null") ?? fallback;
        } catch {
            return fallback;
        }
    };

    const recent = parseJson("profilePredictions", []);
    const totalPredictions = Number(parseJson("profileTotalPredictions", 0) || 0);
    const lastResult = parseJson("profileLastResult", "No predictions yet");
    const lastProbability = parseJson("profileLastProbability", null);

    const totalNode = document.getElementById("statTotalPredictions");
    const lastNode = document.getElementById("statLastResult");
    const avgNode = document.getElementById("statAverageRisk");
    const highNode = document.getElementById("statHighestRisk");
    const riskCardNode = document.getElementById("profileRiskCard");
    const riskPercentNode = document.getElementById("profileRiskPercent");
    const riskStatusNode = document.getElementById("profileRiskStatus");
    const recentPredictionNode = document.getElementById("recentPredictionValue");
    const momentumNode = document.getElementById("insightRiskMomentum");
    const recentResultNode = document.getElementById("insightRecentResult");

    if (totalNode) totalNode.textContent = String(totalPredictions || 0);
    if (lastNode) lastNode.textContent = String(lastResult || "No predictions yet");

    const average = recent.length
        ? Math.round(recent.reduce((sum, row) => sum + Number(row.probability || 0), 0) / recent.length)
        : 0;
    const highest = recent.length
        ? Math.max(...recent.map((row) => Number(row.probability || 0)))
        : Number(lastProbability || 0);
    const safeLastProbability = Math.min(100, Math.max(0, Number(lastProbability || 0)));
    const latestLevel = getRiskLevel(safeLastProbability);

    if (avgNode) avgNode.textContent = `${average}%`;
    if (highNode) highNode.textContent = `${highest}%`;
    if (riskPercentNode) riskPercentNode.textContent = `${safeLastProbability}%`;
    if (recentPredictionNode) recentPredictionNode.textContent = `${safeLastProbability.toFixed(2)}%`;
    if (riskStatusNode) riskStatusNode.textContent = riskLabel(latestLevel);
    if (recentResultNode) recentResultNode.textContent = String(lastResult || "No predictions yet");
    if (momentumNode) {
        momentumNode.textContent =
            safeLastProbability >= 70 ? "Critical" : safeLastProbability >= 40 ? "Watchlist" : "Stable";
    }
    if (riskCardNode) riskCardNode.classList.add(`risk-${latestLevel}`);

    const riskRingNode = document.getElementById("profileRiskRing");
    if (riskRingNode) {
        // SVG circle with r=56 has circumference ~352
        const circumference = 352;
        const offset = circumference - (circumference * safeLastProbability) / 100;
        requestAnimationFrame(() => {
            riskRingNode.style.strokeDashoffset = offset;
        });
    }

    document.querySelectorAll(".mini-risk-fill").forEach((node) => {
        const value = Math.min(100, Math.max(0, Number(node.getAttribute("data-width") || 0)));
        node.style.width = `${value}%`;
    });

    const themeToggle = document.getElementById("themeToggleProfile");
    if (themeToggle) {
        themeToggle.addEventListener("click", () => {
            const html = document.documentElement;
            const next = html.getAttribute("data-theme") === "dark" ? "light" : "dark";
            html.setAttribute("data-theme", next);
            localStorage.setItem("theme", next);
            document.querySelectorAll("[data-theme-icon]").forEach((icon) => {
                icon.className = next === "dark" ? "fa-solid fa-sun" : "fa-solid fa-moon";
            });
            showToast(next === "dark" ? "Dark theme enabled." : "Light theme enabled.");
        });
    }

    const reduceToggle = document.getElementById("reduceMotionToggle");
    if (reduceToggle) {
        reduceToggle.checked = localStorage.getItem("reduceMotion") === "true";
        reduceToggle.addEventListener("change", () => {
            localStorage.setItem("reduceMotion", String(reduceToggle.checked));
            document.documentElement.toggleAttribute("data-reduce-motion", reduceToggle.checked);
            showToast(reduceToggle.checked ? "Reduced motion enabled." : "Reduced motion disabled.");
        });
    }

    const modal = document.getElementById("profileModal");
    const openModal = document.getElementById("openProfileModal");
    const closeModal = document.getElementById("closeProfileModal");
    const form = document.getElementById("profileEditForm");

    const closeModalFn = () => {
        if (!modal) return;
        modal.classList.remove("show");
        modal.setAttribute("aria-hidden", "true");
    };

    if (openModal && modal) {
        openModal.addEventListener("click", () => {
            modal.classList.add("show");
            modal.setAttribute("aria-hidden", "false");
        });
    }

    if (closeModal) closeModal.addEventListener("click", closeModalFn);
    if (modal) {
        modal.addEventListener("click", (event) => {
            if (event.target === modal) closeModalFn();
        });
    }

    if (form) {
        form.addEventListener("submit", (event) => {
            event.preventDefault();
            closeModalFn();
            showToast("Profile changes saved in UI preview.");
        });
    }
}

function exportCsv(rows) {
    const headers = [
        "date",
        "CreditScore",
        "Age",
        "Tenure",
        "Balance",
        "HasCrCard",
        "IsActiveMember",
        "EstimatedSalary",
        "prediction",
        "probability",
    ];

    const lines = [headers.join(",")];
    rows.forEach((row) => {
        const line = headers.map((key) => JSON.stringify(row[key] ?? "")).join(",");
        lines.push(line);
    });

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "prediction-history.csv";
    link.click();
    URL.revokeObjectURL(link.href);
}

function showToast(message) {
    let wrap = document.querySelector(".toast-wrap");
    if (!wrap) {
        wrap = document.createElement("div");
        wrap.className = "toast-wrap";
        document.body.appendChild(wrap);
    }

    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    wrap.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 2800);
}
