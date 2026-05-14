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
    initRoleDashboards();
    initAnalystReportingPage();
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
    const nav = document.querySelector(".app-nav") || document.querySelector(".landing-nav");
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
            const icon = menuToggle.querySelector("i");
            if (icon) {
                icon.className = expanded ? "fa-solid fa-bars" : "fa-solid fa-xmark";
            }
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
            valid = validateRequired("role", "Role is required.") && valid;
            valid = validateOfficialId("role", "officialId") && valid;
            valid = validatePassword("password") && valid;
            valid = validateConfirmPassword("password", "confirm_password") && valid;
            valid = validateCheckbox("acceptTerms", "Please agree to Terms & Privacy.") && valid;
            if (!valid) event.preventDefault();
        });

        const roleInput = document.getElementById("role");
        const officialIdInput = document.getElementById("officialId");
        if (roleInput && officialIdInput) {
            const rolePicker = document.getElementById("rolePicker");
            if (rolePicker) {
                const choices = Array.from(rolePicker.querySelectorAll("[data-role-choice]"));
                const syncRolePicker = () => {
                    const selectedRole = String(roleInput.value || "").trim();
                    choices.forEach((choice) => {
                        const isActive = choice.getAttribute("data-role-choice") === selectedRole;
                        choice.classList.toggle("is-active", isActive);
                        choice.setAttribute("aria-pressed", isActive ? "true" : "false");
                    });
                };

                choices.forEach((choice) => {
                    choice.addEventListener("click", () => {
                        roleInput.value = String(choice.getAttribute("data-role-choice") || "");
                        roleInput.dispatchEvent(new Event("change", { bubbles: true }));
                        validateRequired("role", "Role is required.");
                        syncRolePicker();
                    });
                });

                roleInput.addEventListener("change", syncRolePicker);
                syncRolePicker();
            }

            const normalizeOfficial = () => {
                officialIdInput.value = String(officialIdInput.value || "").trim().toUpperCase();
                validateOfficialId("role", "officialId");
            };
            roleInput.addEventListener("change", normalizeOfficial);
            officialIdInput.addEventListener("input", normalizeOfficial);
        }

        bindPasswordStrength("password", "passwordStrengthFill", "passwordStrengthHint");
    }

    const forgotPasswordForm = document.getElementById("forgotPasswordForm");
    if (forgotPasswordForm) {
        forgotPasswordForm.addEventListener("submit", (event) => {
            const valid = validateEmail("forgotEmail");
            if (!valid) event.preventDefault();
        });
    }

    const resetPasswordForm = document.getElementById("resetPasswordForm");
    if (resetPasswordForm) {
        bindPasswordStrength("newPassword", "resetPasswordStrengthFill", "resetPasswordStrengthHint");
        resetPasswordForm.addEventListener("submit", (event) => {
            let valid = true;
            valid = validatePassword("newPassword") && valid;
            valid = validateConfirmPassword("newPassword", "confirmNewPassword") && valid;
            if (!valid) event.preventDefault();
        });
    }
}

function bindPasswordStrength(passwordId, fillId, hintId) {
    const password = document.getElementById(passwordId);
    const fill = document.getElementById(fillId);
    const hint = document.getElementById(hintId);
    if (!password || !fill || !hint) return;

    const syncStrength = () => {
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
    };

    syncStrength();
    password.addEventListener("input", syncStrength);
}

function validateOfficialId(roleId, officialId) {
    const roleInput = document.getElementById(roleId);
    const officialInput = document.getElementById(officialId);
    if (!roleInput || !officialInput) return true;

    const role = String(roleInput.value || "").trim();
    const value = String(officialInput.value || "").trim().toUpperCase();
    officialInput.value = value;

    if (!role || !value) {
        setFieldError("officialId", "Official ID is required.");
        return false;
    }

    const pattern = role === "Employee" ? /^AEMP\d{3}$/ : role === "Analyst" ? /^AANA\d{3}$/ : null;
    const ok = Boolean(pattern && pattern.test(value));
    setFieldError(
        "officialId",
        ok ? "" : role === "Employee" ? "Use Employee ID format: AEMP + 3 digits." : "Use Analyst ID format: AANA + 3 digits."
    );
    return ok;
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

function validateClientId(id) {
    const input = document.getElementById(id);
    if (!input) return true;
    const normalized = String(input.value || "").trim().toUpperCase();
    input.value = normalized;
    const ok = /^C\d+$/.test(normalized);
    setFieldError(id, ok ? "" : "CustomerId must start with C followed by numbers.");
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
        form.addEventListener("submit", (event) => {
            if (!validateClientId("customerId")) {
                event.preventDefault();
                return;
            }
            const payload = {
                CustomerId: String(document.getElementById("customerId")?.value || "").trim().toUpperCase(),
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
    const influenceList = document.getElementById("influenceList");
    const actionCards = document.getElementById("actionCards");
    const hasServerGuidance =
        Boolean(influenceList && influenceList.children.length) &&
        Boolean(actionCards && actionCards.children.length);

    if (!hasServerGuidance) {
        renderInfluenceAndActions(probability);
    }
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
                <p>Customer ID: <strong>${row.CustomerId || "-"}</strong></p>
                <p>Prediction: <strong>${prediction}</strong></p>
                <p>Probability: <strong>${probability.toFixed(2)}%</strong></p>
                <p>Risk level: <strong>${riskLabel(level)}</strong></p>
            </div>
            <div class="modal-section">
                <h4>Data Used</h4>
                <p>CreditScore: ${row.CreditScore}, Age: ${row.Age}, Tenure: ${row.Tenure}, Balance: ${Number(row.Balance || 0).toLocaleString()}, NumOfProducts: ${row.NumOfProducts || "-"}</p>
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
            const text = `${row.CustomerId || ""} ${row.CreditScore} ${row.Age} ${row.Balance} ${row.prediction} ${row.probability}`.toLowerCase();
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
                                    <strong>${row.CustomerId || "Customer -"} | Score ${row.CreditScore} | Age ${row.Age}</strong>
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


function initAnalystReportingPage() {
    const current = pageId();
    if (current !== "analyst-analysis" && current !== "analyst-reports") return;

    const tbody = document.getElementById("analystReportBody");
    const empty = document.getElementById("analystReportEmpty");
    const form = document.getElementById("analystFilterForm");
    const clearBtn = document.getElementById("clearFiltersBtn");
    const rowsPerPageInput = document.getElementById("rowsPerPage");
    const prevBtn = document.getElementById("analystPrevPage");
    const nextBtn = document.getElementById("analystNextPage");
    const pageInfo = document.getElementById("analystPageInfo");
    const applyFiltersBtn = document.getElementById("applyFiltersBtn");
    const exportCsvBtn = document.getElementById("exportAnalystCsvBtn");
    const exportExcelBtn = document.getElementById("exportAnalystExcelBtn");
    const exportPdfBtn = document.getElementById("exportAnalystPdfBtn");
    const loadingOverlay = document.getElementById("tableLoadingOverlay");

    const money = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

    const state = {
        page: 1,
        rowsPerPage: Number(rowsPerPageInput?.value || 25),
        totalRows: 0,
        totalPages: 1,
        isLoading: false,
        rows: [],
        sortBy: "date",
        sortOrder: "desc"
    };

    const readValue = (id) => document.getElementById(id)?.value || "";

    const normalizeRiskLevel = (risk, probability) => {
        const normalized = String(risk || "").trim().toLowerCase();
        if (normalized === "high") return "High";
        if (normalized === "medium") return "Medium";
        if (normalized === "low") return "Low";
        if (probability >= 70) return "High";
        if (probability >= 40) return "Medium";
        return "Low";
    };

    const processRow = (row, index) => {
        const probability = Number(row?.probability || 0);
        const customerId = row?.CustomerId || row?.ClientId || `AUTO-${index}`;
        const predictionText = row?.prediction || "Customer Will Stay";
        const predictionKey = predictionText.toLowerCase().includes("churn") ? "churn" : "stay";
        const riskLevel = normalizeRiskLevel(row?.risk_level, probability);
        return {
            ...row,
            customerId,
            predictionText,
            predictionKey,
            probability,
            riskLevel
        };
    };

    const fetchFilteredData = async (silent = false) => {
        if (state.isLoading) return;
        state.isLoading = true;
        
        const loader = document.getElementById("syncLoader");
        if (silent && loader) loader.style.display = "flex";
        else if (loadingOverlay) loadingOverlay.classList.add("active");

        if (applyFiltersBtn) {
            applyFiltersBtn.disabled = true;
            applyFiltersBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Processing...';
        }

        const params = new URLSearchParams({
            ajax: "1",
            page: state.page,
            rowsPerPage: state.rowsPerPage,
            sortBy: state.sortBy,
            sortOrder: state.sortOrder,
            customerId: readValue("filterCustomerId"),
            creditMin: readValue("filterCreditMin"),
            creditMax: readValue("filterCreditMax"),
            ageMin: readValue("filterAgeMin"),
            ageMax: readValue("filterAgeMax"),
            tenureMin: readValue("filterTenureMin"),
            tenureMax: readValue("filterTenureMax"),
            balanceMin: readValue("filterBalanceMin"),
            balanceMax: readValue("filterBalanceMax"),
            salaryMin: readValue("filterSalaryMin"),
            salaryMax: readValue("filterSalaryMax"),
            hasCard: readValue("filterHasCard"),
            active: readValue("filterActive"),
            riskLevel: readValue("filterRiskLevel"),
            prediction: readValue("filterPrediction"),
            probMin: readValue("filterProbabilityMin"),
            probMax: readValue("filterProbabilityMax")
        });

        try {
            const response = await fetch(`/analyst/prediction-analysis?${params.toString()}`);
            const result = await response.json();
            
            state.rows = (result.rows || []).map(processRow);
            state.totalRows = result.total_count || 0;
            state.totalPages = result.total_pages || 1;
            state.page = result.page || 1;
            
            render();
            if (silent) showToast("Reports synchronized with latest employee data.", "info");
        } catch (error) {
            console.error("Filter Fetch Error:", error);
            showToast("Failed to fetch records.", "error");
        } finally {
            state.isLoading = false;
            if (loader) loader.style.display = "none";
            if (loadingOverlay) loadingOverlay.classList.remove("active");
            if (applyFiltersBtn) {
                applyFiltersBtn.disabled = false;
                applyFiltersBtn.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i> Apply Filters';
            }
        }
    };

    const render = () => {
        if (!tbody || !pageInfo) return;

        if (state.rows.length === 0) {
            tbody.innerHTML = '<tr><td colspan="12" class="muted center" style="padding: 60px; text-align: center;"><i class="fa-solid fa-database" style="font-size: 24px; display: block; margin-bottom: 12px; opacity: 0.5;"></i>No records match the current view.</td></tr>';
            if (empty) empty.style.display = "block";
        } else {
            if (empty) empty.style.display = "none";
            tbody.innerHTML = state.rows
                .map((row) => {
                    const riskClass = row.riskLevel === "High" ? "risk-high" : row.riskLevel === "Medium" ? "risk-medium" : "risk-low";
                    const badgeClass = row.riskLevel === "High" ? "high" : row.riskLevel === "Medium" ? "medium" : "low";
                    const predBadgeClass = row.predictionKey === "churn" ? "high" : "low";
                    
                    return `
                        <tr class="${riskClass}">
                            <td><small class="muted">${row.date_display}</small></td>
                            <td><strong>${row.customerId}</strong></td>
                            <td>${row.CreditScore}</td>
                            <td>${row.Age}</td>
                            <td>${row.Tenure}y</td>
                            <td>${money.format(row.Balance)}</td>
                            <td>${money.format(row.EstimatedSalary)}</td>
                            <td><span class="badge ${row.HasCrCard ? "badge-success" : "badge-soft"}">${row.HasCrCard ? "Yes" : "No"}</span></td>
                            <td><span class="badge ${row.IsActiveMember ? "badge-success" : "badge-soft"}">${row.IsActiveMember ? "Yes" : "No"}</span></td>
                            <td><span class="badge ${predBadgeClass}">${row.predictionText}</span></td>
                            <td><strong>${row.probability.toFixed(1)}%</strong></td>
                            <td><span class="badge ${badgeClass}">${row.riskLevel}</span></td>
                            <td><small>${row.entered_by || '-'}</small></td>
                        </tr>
                    `;
                })
                .join("");
        }

        pageInfo.textContent = `Page ${state.page} of ${state.totalPages} (${state.totalRows} total records)`;
        if (prevBtn) prevBtn.disabled = state.page <= 1 || state.isLoading;
        if (nextBtn) nextBtn.disabled = state.page >= state.totalPages || state.isLoading;
    };

    // Event Listeners
    if (form) {
        form.addEventListener("submit", (e) => {
            e.preventDefault();
            state.page = 1;
            fetchFilteredData();
        });
    }

    if (clearBtn) {
        clearBtn.addEventListener("click", () => {
            form.reset();
            state.page = 1;
            fetchFilteredData();
        });
    }

    rowsPerPageInput?.addEventListener("change", () => {
        state.rowsPerPage = Number(rowsPerPageInput.value);
        state.page = 1;
        fetchFilteredData();
    });

    prevBtn?.addEventListener("click", () => {
        if (state.page > 1) {
            state.page--;
            fetchFilteredData();
        }
    });

    nextBtn?.addEventListener("click", () => {
        if (state.page < state.totalPages) {
            state.page++;
            fetchFilteredData();
        }
    });

    const searchInput = document.getElementById("filterCustomerId");
    if (searchInput) {
        let searchTimeout;
        searchInput.addEventListener("input", () => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                state.page = 1;
                fetchFilteredData(true);
            }, 500);
        });
    }

    // Column Sorting (For Reports Page)
    document.querySelectorAll(".enterprise-table th[data-sort]").forEach(th => {
        th.addEventListener("click", () => {
            const field = th.dataset.sort;
            if (state.sortBy === field) {
                state.sortOrder = state.sortOrder === "asc" ? "desc" : "asc";
            } else {
                state.sortBy = field;
                state.sortOrder = "desc";
            }
            
            // Update UI icons
            document.querySelectorAll(".enterprise-table th i").forEach(i => i.className = "fa-solid fa-sort");
            const icon = th.querySelector("i");
            if (icon) icon.className = state.sortOrder === "asc" ? "fa-solid fa-sort-up" : "fa-solid fa-sort-down";
            
            state.page = 1;
            fetchFilteredData();
        });
    });

    const exportFilteredCsv = (rows, filename) => {
        const headers = ["Date", "Customer ID", "Credit Score", "Age", "Tenure", "Balance", "Has CC", "Active", "Salary", "Prediction", "Prob (%)", "Risk", "Entered By"];
        const lines = [headers.join(",")];
        rows.forEach(r => {
            const row = [r.date_display, r.customerId, r.CreditScore, r.Age, r.Tenure, r.Balance, r.HasCrCard?"Yes":"No", r.IsActiveMember?"Yes":"No", r.EstimatedSalary, r.predictionText, r.probability.toFixed(2), r.riskLevel, r.entered_by];
            lines.push(row.map(v => JSON.stringify(String(v))).join(","));
        });
        const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.click();
    };

    const exportFilteredPdf = (rows) => {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF("l", "pt", "a4");
        
        doc.setFontSize(20);
        doc.setTextColor(93, 110, 255);
        doc.text("Customer Churn Prediction Report", 40, 50);
        
        doc.setFontSize(10);
        doc.setTextColor(100, 116, 139);
        doc.text(`Generated: ${new Date().toLocaleString()}`, 40, 70);
        doc.text(`Total Records: ${state.totalRows}`, 40, 85);

        const tableData = rows.map(r => [
            r.date_display,
            r.customerId,
            r.CreditScore,
            r.Age,
            money.format(r.Balance),
            r.IsActiveMember ? "Yes" : "No",
            r.predictionText,
            `${r.probability.toFixed(1)}%`,
            r.riskLevel
        ]);

        doc.autoTable({
            startY: 105,
            head: [["Date", "Customer ID", "Credit", "Age", "Balance", "Active", "Result", "Prob", "Risk"]],
            body: tableData,
            theme: "grid",
            headStyles: { fillColor: [93, 110, 255], fontSize: 9, cellPadding: 8 },
            styles: { fontSize: 8, cellPadding: 6 },
            columnStyles: { 8: { fontStyle: "bold" } }
        });

        doc.save("churn-report.pdf");
    };

    exportCsvBtn?.addEventListener("click", () => {
        if (!state.rows.length) return showToast("No records to export.");
        exportFilteredCsv(state.rows, "churn-report.csv");
        showToast("Exporting to CSV...");
    });

    exportExcelBtn?.addEventListener("click", () => {
        if (!state.rows.length) return showToast("No records to export.");
        exportFilteredCsv(state.rows, "churn-report.csv"); // Excel compatible
        showToast("Exporting to Excel (CSV format)...");
    });

    exportPdfBtn?.addEventListener("click", () => {
        if (!state.rows.length) return showToast("No records to export.");
        if (!window.jspdf) {
            showToast("PDF library not loaded.", "error");
            return;
        }
        exportFilteredPdf(state.rows);
        showToast("Generating PDF...");
    });

    fetchFilteredData();

    // Live Sync: Refresh reports data every 15 seconds
    setInterval(() => {
        if (!state.isLoading && state.page === 1) {
            fetchFilteredData(true); // silent refresh
        }
    }, 15000);
}


function initRoleDashboards() {
    if (pageId() === "admin-analytics") {
        const node = document.getElementById("adminAnalyticsData");
        if (!node) return;
        let data = {};
        try {
            data = JSON.parse(node.textContent || "{}");
        } catch {
            data = {};
        }

        const trendPoints = Array.isArray(data.trend_points) ? data.trend_points : [];
        const activityPoints = Array.isArray(data.activity_points) ? data.activity_points : [];
        const high = Number(data?.high_vs_low?.High || 0);
        const low = Number(data?.high_vs_low?.Low || 0);
        const total = trendPoints.reduce((sum, item) => sum + Number(item.value || 0), 0);

        const kpiTotal = document.getElementById("adminKpiTotal");
        const kpiHighShare = document.getElementById("adminKpiHighShare");
        const kpiTopUser = document.getElementById("adminKpiTopUser");
        if (kpiTotal) kpiTotal.textContent = String(total);

        const riskTotal = high + low;
        const highPct = riskTotal ? Math.round((high / riskTotal) * 100) : 0;
        const lowPct = riskTotal ? 100 - highPct : 0;
        if (kpiHighShare) kpiHighShare.textContent = `${highPct}%`;
        if (kpiTopUser) {
            const top = activityPoints.length ? activityPoints[0] : null;
            kpiTopUser.textContent = top ? `${top.label} (${top.value})` : "-";
        }

        const trendChart = document.getElementById("adminTrendChart");
        if (trendChart) {
            trendChart.innerHTML = "";
            if (!trendPoints.length) {
                trendChart.textContent = "No trend data yet.";
                trendChart.classList.add("muted");
            } else {
                trendChart.classList.remove("muted");
                const maxValue = Math.max(...trendPoints.map((item) => Number(item.value || 0)), 1);
                trendPoints.forEach((point) => {
                    const row = document.createElement("div");
                    row.className = "viz-row";

                    const label = document.createElement("span");
                    label.className = "viz-label";
                    label.textContent = String(point.label || "-");

                    const track = document.createElement("div");
                    track.className = "viz-track";

                    const bar = document.createElement("span");
                    bar.className = "viz-bar";
                    bar.style.width = `${Math.max(8, Math.round((Number(point.value || 0) / maxValue) * 100))}%`;
                    track.appendChild(bar);

                    const value = document.createElement("span");
                    value.className = "viz-value";
                    value.textContent = String(Number(point.value || 0));

                    row.appendChild(label);
                    row.appendChild(track);
                    row.appendChild(value);
                    trendChart.appendChild(row);
                });
            }
        }

        const highBar = document.getElementById("adminRiskHighBar");
        const lowBar = document.getElementById("adminRiskLowBar");
        const legend = document.getElementById("adminRiskLegend");
        if (highBar) highBar.style.width = `${highPct}%`;
        if (lowBar) lowBar.style.width = `${lowPct}%`;
        if (legend) {
            legend.textContent = riskTotal
                ? `High: ${high} (${highPct}%) | Low: ${low} (${lowPct}%)`
                : "No risk data yet.";
        }

        const activityChart = document.getElementById("adminActivityChart");
        if (activityChart) {
            activityChart.innerHTML = "";
            if (!activityPoints.length) {
                activityChart.textContent = "No activity data yet.";
                activityChart.classList.add("muted");
            } else {
                activityChart.classList.remove("muted");
                const maxValue = Math.max(...activityPoints.map((item) => Number(item.value || 0)), 1);
                activityPoints.forEach((point) => {
                    const row = document.createElement("div");
                    row.className = "viz-row";

                    const label = document.createElement("span");
                    label.className = "viz-label";
                    label.textContent = String(point.label || "-");

                    const track = document.createElement("div");
                    track.className = "viz-track";

                    const bar = document.createElement("span");
                    bar.className = "viz-bar alt";
                    bar.style.width = `${Math.max(10, Math.round((Number(point.value || 0) / maxValue) * 100))}%`;
                    track.appendChild(bar);

                    const value = document.createElement("span");
                    value.className = "viz-value";
                    value.textContent = String(Number(point.value || 0));

                    row.appendChild(label);
                    row.appendChild(track);
                    row.appendChild(value);
                    activityChart.appendChild(row);
                });
            }
        }
    }

    if (pageId() === "analyst-dashboard") {
        const dataNode = document.getElementById("analystDashboardData");
        if (!dataNode) return;
        let originalData = {};
        try {
            originalData = JSON.parse(dataNode.textContent || "{}");
        } catch {
            originalData = {};
        }

        const rawRows = Array.isArray(originalData.all_data) ? originalData.all_data : [];
        let filteredRows = [...rawRows];
        let charts = {};

        const kpiElements = {
            total: document.getElementById("kpiTotalPredictions"),
            churn: document.getElementById("kpiChurnRate"),
            retained: document.getElementById("kpiRetained"),
            highRisk: document.getElementById("kpiHighRisk"),
            avgProb: document.getElementById("kpiAvgProb"),
            avgCredit: document.getElementById("kpiAvgCredit")
        };


        // --- CHART INITIALIZATION ---

        const initCharts = () => {
            const commonOptions = {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: '#94a3b8', font: { family: 'Inter', size: 11 } }
                    }
                },
                scales: {
                    x: { ticks: { color: '#64748b' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                    y: { ticks: { color: '#64748b' }, grid: { color: 'rgba(255,255,255,0.05)' } }
                }
            };

            // Donut: Churn Distribution
            charts.churnDist = new Chart(document.getElementById('churnDistChart'), {
                type: 'doughnut',
                data: { labels: ['Retained', 'Churned'], datasets: [{ data: [0, 0], backgroundColor: ['#22c55e', '#ef4444'], borderWidth: 0 }] },
                options: { ...commonOptions, cutout: '70%' }
            });

            // Bar: Risk Level
            charts.riskLevel = new Chart(document.getElementById('riskLevelChart'), {
                type: 'bar',
                data: { labels: ['Low', 'Medium', 'High'], datasets: [{ label: 'Customers', data: [0, 0, 0], backgroundColor: ['#22c55e', '#f59e0b', '#ef4444'], borderRadius: 6 }] },
                options: commonOptions
            });

            // Line: Trend
            charts.trend = new Chart(document.getElementById('trendChart'), {
                type: 'line',
                data: { labels: [], datasets: [{ label: 'Predictions', data: [], borderColor: '#22d3ee', backgroundColor: 'rgba(34,211,238,0.1)', fill: true, tension: 0.4 }] },
                options: commonOptions
            });

            // Bar: Credit Score
            charts.creditScore = new Chart(document.getElementById('creditScoreChart'), {
                type: 'bar',
                data: { labels: ['300-500', '501-650', '651-750', '751-900'], datasets: [{ label: 'Avg Prob (%)', data: [0, 0, 0, 0], backgroundColor: '#5d6eff', borderRadius: 6 }] },
                options: commonOptions
            });

            // Bar: Age Group
            charts.ageGroup = new Chart(document.getElementById('ageGroupChart'), {
                type: 'bar',
                data: { labels: ['18-25', '26-35', '36-45', '46-60', '60+'], datasets: [{ label: 'Churn Count', data: [0, 0, 0, 0, 0], backgroundColor: '#ec4899', borderRadius: 6 }] },
                options: commonOptions
            });

            // Bar: Active Member
            charts.activeMember = new Chart(document.getElementById('activeMemberChart'), {
                type: 'bar',
                data: { labels: ['Active', 'Inactive'], datasets: [{ label: 'Churn Rate %', data: [0, 0], backgroundColor: ['#10b981', '#f43f5e'], borderRadius: 6 }] },
                options: commonOptions
            });

            // Bar: CC usage
            charts.creditCard = new Chart(document.getElementById('creditCardChart'), {
                type: 'bar',
                data: { labels: ['With Card', 'Without Card'], datasets: [{ label: 'Churn Rate %', data: [0, 0], backgroundColor: ['#6366f1', '#8b5cf6'], borderRadius: 6 }] },
                options: commonOptions
            });

            // Area: Balance vs Prob
            charts.balance = new Chart(document.getElementById('balanceChart'), {
                type: 'line',
                data: { labels: [], datasets: [{ label: 'Churn Prob %', data: [], borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.1)', fill: true, tension: 0.3 }] },
                options: commonOptions
            });
        };

        // --- DATA PROCESSING ---

        const updateDashboard = () => {
            const total = rawRows.length;
            const churned = rawRows.filter(r => (r.probability || 0) >= 50).length;
            const retained = total - churned;
            const highRisk = rawRows.filter(r => (r.probability || 0) >= 70).length;
            const avgProb = total ? rawRows.reduce((s, r) => s + (r.probability || 0), 0) / total : 0;
            const avgCredit = total ? rawRows.reduce((s, r) => s + (r.CreditScore || 0), 0) / total : 0;

            // Update KPIs
            if (kpiElements.total) kpiElements.total.textContent = total.toLocaleString();
            if (kpiElements.churn) kpiElements.churn.textContent = `${total ? (churned / total * 100).toFixed(1) : 0}%`;
            if (kpiElements.retained) kpiElements.retained.textContent = retained.toLocaleString();
            if (kpiElements.highRisk) kpiElements.highRisk.textContent = highRisk.toLocaleString();
            if (kpiElements.avgProb) kpiElements.avgProb.textContent = `${avgProb.toFixed(1)}%`;
            if (kpiElements.avgCredit) kpiElements.avgCredit.textContent = Math.round(avgCredit).toLocaleString();

            // Update Charts
            charts.churnDist.data.datasets[0].data = [retained, churned];
            charts.churnDist.update();

            const riskCounts = [
                filteredRows.filter(r => (r.probability || 0) < 40).length,
                filteredRows.filter(r => (r.probability || 0) >= 40 && (r.probability || 0) < 70).length,
                highRisk
            ];
            charts.riskLevel.data.datasets[0].data = riskCounts;
            charts.riskLevel.update();

            // Trend (group by date)
            const trendMap = {};
            rawRows.forEach(r => {
                const d = r.date ? r.date.split('T')[0] : 'Unknown';
                trendMap[d] = (trendMap[d] || 0) + 1;
            });
            const sortedDates = Object.keys(trendMap).sort().slice(-15);
            charts.trend.data.labels = sortedDates;
            charts.trend.data.datasets[0].data = sortedDates.map(d => trendMap[d]);
            charts.trend.update();

            // Age & Credit Score Bins
            const ageBins = [0, 0, 0, 0, 0];
            const csBins = [0, 0, 0, 0];
            const csSums = [0, 0, 0, 0];
            rawRows.forEach(r => {
                const age = r.Age || 0;
                if (age <= 25) ageBins[0] += ((r.probability || 0) >= 50 ? 1 : 0);
                else if (age <= 35) ageBins[1] += ((r.probability || 0) >= 50 ? 1 : 0);
                else if (age <= 45) ageBins[2] += ((r.probability || 0) >= 50 ? 1 : 0);
                else if (age <= 60) ageBins[3] += ((r.probability || 0) >= 50 ? 1 : 0);
                else ageBins[4] += ((r.probability || 0) >= 50 ? 1 : 0);

                const cs = r.CreditScore || 0;
                let idx = cs <= 500 ? 0 : cs <= 650 ? 1 : cs <= 750 ? 2 : 3;
                csBins[idx]++;
                csSums[idx] += (r.probability || 0);
            });
            charts.ageGroup.data.datasets[0].data = ageBins;
            charts.ageGroup.update();
            charts.creditScore.data.datasets[0].data = csBins.map((c, i) => c ? csSums[i] / c : 0);
            charts.creditScore.update();

            // Behavior Comparisons
            const activeRows = rawRows.filter(r => r.IsActiveMember == 1);
            const inactiveRows = rawRows.filter(r => r.IsActiveMember == 0);
            const ccRows = rawRows.filter(r => r.HasCrCard == 1);
            const noCcRows = rawRows.filter(r => r.HasCrCard == 0);

            const getRate = (rows) => rows.length ? (rows.filter(r => (r.probability || 0) >= 50).length / rows.length * 100) : 0;
            charts.activeMember.data.datasets[0].data = [getRate(activeRows), getRate(inactiveRows)];
            charts.activeMember.update();
            charts.creditCard.data.datasets[0].data = [getRate(ccRows), getRate(noCcRows)];
            charts.creditCard.update();

            // Balance Area
            const balanceStep = 20000;
            const balMap = {};
            rawRows.forEach(r => {
                const b = Math.floor((r.Balance || 0) / balanceStep) * balanceStep;
                if (!balMap[b]) balMap[b] = { sum: 0, count: 0 };
                balMap[b].sum += (r.probability || 0);
                balMap[b].count++;
            });
            const sortedBals = Object.keys(balMap).sort((a, b) => Number(a) - Number(b)).slice(0, 15);
            charts.balance.data.labels = sortedBals.map(b => `$${Number(b) / 1000}k`);
            charts.balance.data.datasets[0].data = sortedBals.map(b => balMap[b].sum / balMap[b].count);
            charts.balance.update();


            // Update Latest Predictions Table
            const latestTableBody = document.getElementById("latestPredictionsBody");
            if (latestTableBody) {
                const recentDocs = [...rawRows].slice(0, 10);
                if (recentDocs.length === 0) {
                    latestTableBody.innerHTML = "<tr><td colspan='5' class='muted center' style='padding:20px;'>No prediction records available.</td></tr>";
                } else {
                    latestTableBody.innerHTML = recentDocs.map(r => {
                        const prob = r.probability || 0;
                        const risk = (r.risk_level || 'Low').toLowerCase();
                        return `
                            <tr>
                                <td><strong>${r.CustomerId || '-'}</strong></td>
                                <td>${r.prediction || '-'}</td>
                                <td><span class="badge ${risk}">${prob.toFixed(2)}%</span></td>
                                <td>${r.entered_by || '-'}</td>
                                <td><small class="muted">${r.date_display || '-'}</small></td>
                            </tr>
                        `;
                    }).join("");
                }
            }
        };


        // --- EXPORT LOGIC ---

        const downloadCSV = (rows, filename) => {
            const headers = ["CustomerId", "RiskLevel", "Probability", "CreditScore", "Age", "Balance", "IsActive", "HasCrCard", "Prediction", "Date"];
            const csvData = rows.map(r => [
                r.CustomerId,
                getRiskLevel(r.probability || 0),
                (r.probability || 0).toFixed(2),
                r.CreditScore,
                r.Age,
                r.Balance,
                r.IsActiveMember,
                r.HasCrCard,
                (r.probability >= 50 ? 'Churn' : 'Stay'),
                r.date
            ].join(","));
            const blob = new Blob([[headers.join(",")].concat(csvData).join("\n")], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = filename;
            link.click();
        };

        const downloadPDF = () => {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF('p', 'pt');
            doc.setFontSize(22);
            doc.setTextColor(34, 211, 238);
            doc.text("Analyst Churn Insight Report", 40, 60);
            doc.setFontSize(12);
            doc.setTextColor(100, 116, 139);
            doc.text(`Generated on: ${new Date().toLocaleString()}`, 40, 85);
            doc.text(`Total Records Analyzed: ${filteredRows.length}`, 40, 105);

            const tableData = filteredRows.slice(0, 50).map(r => [
                r.CustomerId,
                getRiskLevel(r.probability || 0).toUpperCase(),
                `${(r.probability || 0).toFixed(1)}%`,
                r.CreditScore,
                r.Age,
                `$${(r.Balance || 0).toFixed(0)}`
            ]);

            doc.autoTable({
                startY: 130,
                head: [['Customer ID', 'Risk', 'Prob', 'Score', 'Age', 'Balance']],
                body: tableData,
                theme: 'striped',
                headStyles: { fillColor: [93, 110, 255] }
            });

            doc.save('analyst_churn_report.pdf');
            showToast("PDF Report generated successfully.");
        };

        // --- EVENT LISTENERS ---

        document.getElementById('exportCsvBtn')?.addEventListener('click', () => downloadCSV(rawRows, 'churn_data_export.csv'));
        document.getElementById('exportExcelBtn')?.addEventListener('click', () => downloadCSV(rawRows, 'churn_analytics_export.csv')); // CSV is Excel compatible
        document.getElementById('exportPdfBtn')?.addEventListener('click', downloadPDF);

        // --- SIMULATOR LOGIC ---
        const simForm = document.getElementById('simulatorForm');
        const btnPredictSim = document.getElementById('btnPredictSim');
        const btnResetSim = document.getElementById('btnResetSim');
        const btnSaveSim = document.getElementById('btnSaveSim');
        const simResultEmpty = document.querySelector('.sim-result-empty');
        const simResultContent = document.querySelector('.sim-result-content');

        if (simForm) {
            simForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const formData = new FormData(simForm);
                const payload = Object.fromEntries(formData.entries());

                // UI Loading State
                btnPredictSim.disabled = true;
                btnPredictSim.querySelector('.btn-text').style.display = 'none';
                btnPredictSim.querySelector('.btn-loader').style.display = 'inline-block';

                try {
                    // Remove NumOfProducts from payload
                    const { NumOfProducts, ...cleanPayload } = payload;
                    
                    const response = await fetch('/analyst/simulate', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(cleanPayload)
                    });

                    const result = await response.json();

                    if (!response.ok) {
                        showToast(result.error || "Simulation failed", "error");
                        return;
                    }

                    // Update UI with Result
                    if (simResultEmpty) simResultEmpty.style.display = 'none';
                    if (simResultContent) simResultContent.style.display = 'block';

                    const prob = result.probability || 0;
                    const probText = document.getElementById('simProbText');
                    const gaugeFill = document.getElementById('simGaugeFill');
                    const riskBadge = document.getElementById('simRiskBadge');
                    const predictionText = document.getElementById('simPredictionText');
                    const explanationText = document.getElementById('simExplanation');

                    // Animate probability number
                    let start = 0;
                    const duration = 1000;
                    const startTime = performance.now();

                    const animate = (currentTime) => {
                        const elapsed = currentTime - startTime;
                        const progress = Math.min(elapsed / duration, 1);
                        const currentProb = Math.floor(progress * prob);
                        if (probText) probText.textContent = `${currentProb}%`;
                        if (progress < 1) requestAnimationFrame(animate);
                    };
                    requestAnimationFrame(animate);

                    // Update Gauge
                    if (gaugeFill) {
                        const circumference = 283;
                        const offset = circumference - (prob / 100) * circumference;
                        gaugeFill.style.strokeDashoffset = offset;
                        
                        // Color based on risk
                        let color = '#22c55e'; // Green
                        if (prob >= 70) color = '#ef4444'; // Red
                        else if (prob >= 40) color = '#f59e0b'; // Yellow
                        gaugeFill.style.stroke = color;
                    }

                    // Update Details
                    if (riskBadge) {
                        riskBadge.textContent = result.risk_level || '---';
                        riskBadge.className = `badge ${result.risk_level?.toLowerCase() || ''}`;
                    }
                    if (predictionText) predictionText.textContent = result.prediction || '---';
                    if (explanationText) explanationText.textContent = result.explanation || '';

                    if (btnSaveSim) btnSaveSim.disabled = false;
                    showToast("Simulation complete", "success");

                } catch (err) {
                    console.error("Simulator Error:", err);
                    showToast("Network error. Try again.", "error");
                } finally {
                    btnPredictSim.disabled = false;
                    btnPredictSim.querySelector('.btn-text').style.display = 'inline-block';
                    btnPredictSim.querySelector('.btn-loader').style.display = 'none';
                }
            });

            btnResetSim?.addEventListener('click', () => {
                simForm.reset();
                if (simResultEmpty) simResultEmpty.style.display = 'block';
                if (simResultContent) simResultContent.style.display = 'none';
                if (btnSaveSim) btnSaveSim.disabled = true;
            });


            btnSaveSim?.addEventListener('click', async () => {
                const formData = new FormData(simForm);
                const payload = Object.fromEntries(formData.entries());
                
                // Get the probability and other results from the previous simulation
                // These are stored in the UI or we can re-simulate on the server
                // Better to just send the form data plus a flag
                
                btnSaveSim.disabled = true;
                const originalHtml = btnSaveSim.innerHTML;
                btnSaveSim.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Saving...';

                try {
                    const response = await fetch('/analyst/save-simulation', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });

                    const result = await response.json();
                    if (response.ok) {
                        showToast("Prediction saved to official records.", "success");
                        btnSaveSim.innerHTML = '<i class="fa-solid fa-check"></i> Saved';
                        setTimeout(() => {
                            btnSaveSim.disabled = false;
                            btnSaveSim.innerHTML = originalHtml;
                        }, 3000);
                    } else {
                        showToast(result.error || "Failed to save", "error");
                        btnSaveSim.disabled = false;
                        btnSaveSim.innerHTML = originalHtml;
                    }
                } catch (err) {
                    showToast("Network error while saving", "error");
                    btnSaveSim.disabled = false;
                    btnSaveSim.innerHTML = originalHtml;
                }
            });
        }

        document.getElementById('analystRefreshBtn')?.addEventListener('click', () => {
            showToast("Refreshing data stream...");
            location.reload();
        });

        // Initialize
        initCharts();
        updateDashboard();

        // --- REAL-TIME SYNC ---
        const syncData = async () => {
            try {
                const res = await fetch('/analyst/dashboard/data');
                const newData = await res.json();
                if (newData && newData.all_data) {
                    rawRows.length = 0;
                    rawRows.push(...newData.all_data);
                    filteredRows = [...rawRows];
                    updateDashboard();
                }
            } catch (err) {
                console.warn("Dashboard sync failed:", err);
            }
        };

        // Poll every 15 seconds
        setInterval(syncData, 15000);
    }
}

function initHomePage() {
    if (pageId() !== "home") return;

    const navLinks = Array.from(document.querySelectorAll(".landing-nav__center a[href^='#'], #mobileNavPanel a[href^='#']"));
    const sectionIds = ["top", "features", "faq"];

    const syncActiveNav = () => {
        const current = sectionIds.findLast((id) => {
            const section = document.getElementById(id);
            if (!section) return false;
            const rect = section.getBoundingClientRect();
            return rect.top <= 140;
        }) || "top";

        navLinks.forEach((link) => {
            const isActive = link.getAttribute("href") === `#${current}`;
            link.classList.toggle("active", isActive);
        });
    };

    window.addEventListener("scroll", syncActiveNav, { passive: true });
    syncActiveNav();

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
        "CustomerId",
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
