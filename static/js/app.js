document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    initNavbar();
    initReveal();
    initFloatingFields();
    initAuthForms();
    initHomePage();
    initPredictPage();
    initHistoryPage();
    initAnalystReportingPage();
    initProfilePage();
    initRoleDashboards();
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

    const dataNode = document.getElementById("analystReportData");
    const tbody = document.getElementById("analystReportBody");
    const empty = document.getElementById("analystReportEmpty");
    const form = document.getElementById("analystFilterForm");
    const clearBtn = document.getElementById("clearFiltersBtn");
    const exportBtn = document.getElementById("exportAnalystCsvBtn");
    const sortByInput = document.getElementById("sortBy");
    const sortOrderInput = document.getElementById("sortOrder");
    const rowsPerPageInput = document.getElementById("rowsPerPage");
    const prevBtn = document.getElementById("analystPrevPage");
    const nextBtn = document.getElementById("analystNextPage");
    const pageInfo = document.getElementById("analystPageInfo");

    let rawRows = [];
    try {
        rawRows = JSON.parse(dataNode?.textContent || "[]");
    } catch {
        rawRows = [];
    }

    const money = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

    const normalizeRiskLevel = (risk, probability) => {
        const normalized = String(risk || "").trim().toLowerCase();
        if (normalized === "high") return "High";
        if (normalized === "medium") return "Medium";
        if (normalized === "low") return "Low";
        if (probability >= 70) return "High";
        if (probability >= 40) return "Medium";
        return "Low";
    };

    const normalizedRows = rawRows.map((row, index) => {
        const probability = Number(row?.probability || 0);
        const customerRaw = String(row?.CustomerId || row?.ClientId || "").trim();
        const fallbackId = `AUTO-CUST-${String(index + 1).padStart(3, "0")}`;
        const customerId = customerRaw || fallbackId;
        const predictionText = String(row?.prediction || "Customer Will Stay").trim() || "Customer Will Stay";
        const predictionKey = predictionText.toLowerCase().includes("churn") ? "churn" : "stay";
        const riskLevel = normalizeRiskLevel(row?.risk_level, probability);
        const dateObj = row?.date ? new Date(row.date) : new Date();
        const safeDate = Number.isNaN(dateObj.getTime()) ? new Date() : dateObj;

        return {
            date: safeDate,
            dateDisplay: row?.date_display || formatDateTimeDisplay(safeDate.toISOString()),
            customerId,
            creditScore: Number(row?.CreditScore || 0),
            age: Number(row?.Age || 0),
            tenure: Number(row?.Tenure || 0),
            balance: Number(row?.Balance || 0),
            numOfProducts: Number(row?.NumOfProducts || 0),
            hasCreditCard: Number(row?.HasCrCard || 0) === 1,
            isActiveMember: Number(row?.IsActiveMember || 0) === 1,
            estimatedSalary: Number(row?.EstimatedSalary || 0),
            predictionText,
            predictionKey,
            probability,
            riskLevel,
        };
    });

    const state = {
        page: 1,
        rowsPerPage: Number(rowsPerPageInput?.value || 25),
        filteredSorted: [...normalizedRows],
    };

    const readNumber = (id) => {
        const value = String(document.getElementById(id)?.value || "").trim();
        if (!value) return null;
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    };

    const readText = (id) => String(document.getElementById(id)?.value || "").trim();

    const withinMinMax = (value, minValue, maxValue) => {
        if (minValue !== null && value < minValue) return false;
        if (maxValue !== null && value > maxValue) return false;
        return true;
    };

    const probabilityClass = (value) => {
        if (value <= 30) return "low";
        if (value <= 60) return "medium";
        return "high";
    };

    const riskRank = (risk) => {
        if (risk === "Low") return 1;
        if (risk === "Medium") return 2;
        return 3;
    };

    const exportFilteredCsv = (rows) => {
        const headers = [
            "Date",
            "Customer ID",
            "Credit Score",
            "Age",
            "Tenure",
            "Balance",
            "Number of Products",
            "Has Credit Card",
            "Is Active Member",
            "Estimated Salary",
            "Prediction",
            "Probability",
            "Risk Level",
        ];

        const lines = [headers.join(",")];
        rows.forEach((row) => {
            const lineValues = [
                row.dateDisplay,
                row.customerId,
                row.creditScore,
                row.age,
                row.tenure,
                row.balance,
                row.numOfProducts,
                row.hasCreditCard ? "Yes" : "No",
                row.isActiveMember ? "Active" : "Inactive",
                row.estimatedSalary,
                row.predictionText,
                `${row.probability.toFixed(2)}%`,
                row.riskLevel,
            ];
            lines.push(lineValues.map((item) => JSON.stringify(item)).join(","));
        });

        const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = "analyst-prediction-report.csv";
        link.click();
        URL.revokeObjectURL(link.href);
    };

    const applyFiltersAndSort = () => {
        const customerQuery = readText("filterCustomerId").toLowerCase();
        const creditMin = readNumber("filterCreditMin");
        const creditMax = readNumber("filterCreditMax");
        const ageMin = readNumber("filterAgeMin");
        const ageMax = readNumber("filterAgeMax");
        const tenureMin = readNumber("filterTenureMin");
        const tenureMax = readNumber("filterTenureMax");
        const balanceMin = readNumber("filterBalanceMin");
        const balanceMax = readNumber("filterBalanceMax");
        const salaryMin = readNumber("filterSalaryMin");
        const salaryMax = readNumber("filterSalaryMax");
        const hasCard = readText("filterHasCard");
        const activeMember = readText("filterActive");
        const riskLevel = readText("filterRiskLevel");
        const prediction = readText("filterPrediction");
        const probabilityMin = readNumber("filterProbabilityMin");
        const probabilityMax = readNumber("filterProbabilityMax");

        const filtered = normalizedRows.filter((row) => {
            if (customerQuery && !row.customerId.toLowerCase().includes(customerQuery)) return false;
            if (!withinMinMax(row.creditScore, creditMin, creditMax)) return false;
            if (!withinMinMax(row.age, ageMin, ageMax)) return false;
            if (!withinMinMax(row.tenure, tenureMin, tenureMax)) return false;
            if (!withinMinMax(row.balance, balanceMin, balanceMax)) return false;
            if (!withinMinMax(row.estimatedSalary, salaryMin, salaryMax)) return false;
            if (!withinMinMax(row.probability, probabilityMin, probabilityMax)) return false;
            if (hasCard === "yes" && !row.hasCreditCard) return false;
            if (hasCard === "no" && row.hasCreditCard) return false;
            if (activeMember === "active" && !row.isActiveMember) return false;
            if (activeMember === "inactive" && row.isActiveMember) return false;
            if (riskLevel && row.riskLevel !== riskLevel) return false;
            if (prediction && row.predictionKey !== prediction) return false;
            return true;
        });

        const sortBy = readText("sortBy") || "probability";
        const sortOrder = readText("sortOrder") || "desc";

        filtered.sort((a, b) => {
            let compared = 0;
            if (sortBy === "customerId") compared = a.customerId.localeCompare(b.customerId);
            if (sortBy === "creditScore") compared = a.creditScore - b.creditScore;
            if (sortBy === "age") compared = a.age - b.age;
            if (sortBy === "tenure") compared = a.tenure - b.tenure;
            if (sortBy === "balance") compared = a.balance - b.balance;
            if (sortBy === "estimatedSalary") compared = a.estimatedSalary - b.estimatedSalary;
            if (sortBy === "numOfProducts") compared = a.numOfProducts - b.numOfProducts;
            if (sortBy === "probability") compared = a.probability - b.probability;
            if (sortBy === "riskLevel") compared = riskRank(a.riskLevel) - riskRank(b.riskLevel);
            return sortOrder === "asc" ? compared : compared * -1;
        });

        state.filteredSorted = filtered;
        state.rowsPerPage = Number(rowsPerPageInput?.value || 25);
        state.page = 1;
        render();
    };

    const render = () => {
        if (!tbody || !pageInfo) return;

        const totalRows = state.filteredSorted.length;
        const totalPages = Math.max(1, Math.ceil(totalRows / state.rowsPerPage));
        state.page = Math.max(1, Math.min(state.page, totalPages));

        const start = (state.page - 1) * state.rowsPerPage;
        const end = start + state.rowsPerPage;
        const pageRows = state.filteredSorted.slice(start, end);

        tbody.innerHTML = pageRows
            .map((row) => {
                const probabilityTone = probabilityClass(row.probability);
                const predictionClass = row.predictionKey === "churn" ? "badge-prediction-churn" : "badge-prediction-stay";
                const riskClass = row.riskLevel === "High" ? "badge-risk-high" : row.riskLevel === "Medium" ? "badge-risk-medium" : "badge-risk-low";
                return `
                    <tr>
                        <td>${row.dateDisplay}</td>
                        <td>${row.customerId}</td>
                        <td>${row.creditScore}</td>
                        <td>${row.age}</td>
                        <td>${row.tenure}</td>
                        <td>${money.format(row.balance)}</td>
                        <td>${row.numOfProducts}</td>
                        <td><span class="badge ${row.hasCreditCard ? "badge-binary-yes" : "badge-binary-no"}">${row.hasCreditCard ? "Yes" : "No"}</span></td>
                        <td><span class="badge ${row.isActiveMember ? "badge-binary-active" : "badge-binary-inactive"}">${row.isActiveMember ? "Active" : "Inactive"}</span></td>
                        <td>${money.format(row.estimatedSalary)}</td>
                        <td><span class="badge ${predictionClass}">${row.predictionText}</span></td>
                        <td>
                            <div class="probability-cell">
                                <strong>${row.probability.toFixed(2)}%</strong>
                                <div class="probability-track"><span class="probability-fill ${probabilityTone}" style="width:${Math.max(0, Math.min(100, row.probability))}%"></span></div>
                            </div>
                        </td>
                        <td><span class="badge ${riskClass}">${row.riskLevel} Risk</span></td>
                    </tr>
                `;
            })
            .join("");

        if (empty) {
            empty.style.display = totalRows ? "none" : "block";
        }

        pageInfo.textContent = `Page ${state.page} of ${totalPages} (${totalRows} record${totalRows === 1 ? "" : "s"})`;
        if (prevBtn) prevBtn.disabled = state.page <= 1;
        if (nextBtn) nextBtn.disabled = state.page >= totalPages;
    };

    if (form) {
        form.addEventListener("submit", (event) => {
            event.preventDefault();
            applyFiltersAndSort();
        });
    }

    if (clearBtn && form) {
        clearBtn.addEventListener("click", () => {
            form.reset();
            if (sortByInput) sortByInput.value = "probability";
            if (sortOrderInput) sortOrderInput.value = "desc";
            if (rowsPerPageInput) rowsPerPageInput.value = "25";
            applyFiltersAndSort();
        });
    }

    if (sortByInput) sortByInput.addEventListener("change", applyFiltersAndSort);
    if (sortOrderInput) sortOrderInput.addEventListener("change", applyFiltersAndSort);
    if (rowsPerPageInput) {
        rowsPerPageInput.addEventListener("change", () => {
            state.rowsPerPage = Number(rowsPerPageInput.value || 25);
            state.page = 1;
            render();
        });
    }

    if (prevBtn) {
        prevBtn.addEventListener("click", () => {
            state.page -= 1;
            render();
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener("click", () => {
            state.page += 1;
            render();
        });
    }

    if (exportBtn) {
        exportBtn.addEventListener("click", () => {
            if (!state.filteredSorted.length) {
                showToast("No filtered rows available for CSV export.");
                return;
            }
            exportFilteredCsv(state.filteredSorted);
            showToast("Filtered CSV export generated.");
        });
    }

    applyFiltersAndSort();
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
        const node = document.getElementById("analystDashboardData");
        if (!node) return;
        let data = {};
        try {
            data = JSON.parse(node.textContent || "{}");
        } catch {
            data = {};
        }

        const formatNumber = (value) => Number(value || 0).toLocaleString();
        const pct = (value) => `${Number(value || 0).toFixed(2)}%`;

        const setText = (id, value) => {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
        };

        const renderUpdatedAt = (isoDate) => {
            const updated = document.getElementById("analystUpdatedAt");
            if (!updated) return;
            updated.textContent = isoDate
                ? `Updated ${formatDateTimeDisplay(isoDate)}`
                : `Updated ${formatDateTimeDisplay(new Date().toISOString())}`;
        };

        const renderKpis = (payload) => {
            const k = payload?.kpis || {};
            setText("kpiTotalPredictions", formatNumber(k.total_predictions));
            setText("kpiTodayPredictions", formatNumber(k.predictions_today));
            setText("kpiHighRisk", formatNumber(k.high_risk));
            setText("kpiMediumRisk", formatNumber(k.medium_risk));
            setText("kpiLowRisk", formatNumber(k.low_risk));
            setText("kpiAverageProbability", pct(k.average_probability));

            const total = Number(k.total_predictions || 0);
            const high = Number(k.high_risk || 0);
            const medium = Number(k.medium_risk || 0);
            const low = Number(k.low_risk || 0);
            const today = Number(k.predictions_today || 0);
            const distTotal = high + medium + low;

            setText("kpiTotalPredictionsMeta", total ? `Dataset coverage: ${total} predictions` : "No predictions captured yet");
            setText("kpiTodayPredictionsMeta", today ? `${today} predictions generated today` : "No predictions generated today");
            setText(
                "kpiHighRiskMeta",
                distTotal ? `${((high / distTotal) * 100).toFixed(1)}% of all risk segments` : "Risk segmentation pending"
            );
            setText(
                "kpiMediumRiskMeta",
                distTotal ? `${((medium / distTotal) * 100).toFixed(1)}% of all risk segments` : "Risk segmentation pending"
            );
            setText(
                "kpiLowRiskMeta",
                distTotal ? `${((low / distTotal) * 100).toFixed(1)}% of all risk segments` : "Risk segmentation pending"
            );
            setText(
                "kpiAverageProbabilityMeta",
                total ? `Based on ${total} records` : "Waiting for prediction records"
            );
        };

        const renderDonut = (payload) => {
            const dist = payload?.risk_distribution || {};
            const high = Number(dist.High || 0);
            const medium = Number(dist.Medium || 0);
            const low = Number(dist.Low || 0);
            const total = high + medium + low;

            const highPct = total ? (high / total) * 100 : 0;
            const medPct = total ? (medium / total) * 100 : 0;
            const lowPct = total ? (low / total) * 100 : 0;

            const donut = document.getElementById("riskDonutChart");
            if (donut) {
                donut.style.background = total
                    ? `conic-gradient(#ef4444 0 ${highPct}%, #f59e0b ${highPct}% ${highPct + medPct}%, #22c55e ${highPct + medPct}% 100%)`
                    : "conic-gradient(rgba(148,163,184,0.5) 0 100%)";
                donut.innerHTML = `<div class=\"analyst-donut-center\"><strong>${total}</strong><small>Total</small></div>`;
            }

            const legend = document.getElementById("riskDonutLegend");
            if (legend) {
                legend.innerHTML = `
                    <div><span><i class=\"fa-solid fa-circle\" style=\"color:#ef4444\"></i> High Risk</span><strong>${high}</strong></div>
                    <div><span><i class=\"fa-solid fa-circle\" style=\"color:#f59e0b\"></i> Medium Risk</span><strong>${medium}</strong></div>
                    <div><span><i class=\"fa-solid fa-circle\" style=\"color:#22c55e\"></i> Low Risk</span><strong>${low}</strong></div>
                `;
            }
        };

        const renderTrend = (payload) => {
            const points = Array.isArray(payload?.trend_points) ? payload.trend_points : [];
            const svg = document.getElementById("predictionTrendChart");
            const meta = document.getElementById("predictionTrendMeta");
            if (!svg) return;

            if (!points.length) {
                svg.innerHTML = "<text x='50%' y='50%' text-anchor='middle' fill='currentColor' opacity='0.65'>No trend data yet</text>";
                if (meta) meta.textContent = "No trend change detected yet.";
                return;
            }

            const values = points.map((p) => Number(p.value || 0));
            const maxV = Math.max(...values, 1);
            const minV = Math.min(...values, 0);
            const width = 640;
            const height = 240;
            const padX = 30;
            const padY = 24;
            const drawableW = width - padX * 2;
            const drawableH = height - padY * 2;

            const toX = (index) => padX + (index * drawableW) / Math.max(points.length - 1, 1);
            const toY = (value) => {
                if (maxV === minV) return padY + drawableH / 2;
                return padY + drawableH - ((value - minV) / (maxV - minV)) * drawableH;
            };

            const coordinates = points.map((p, i) => ({
                x: toX(i),
                y: toY(Number(p.value || 0)),
                label: String(p.label || "-"),
                value: Number(p.value || 0),
            }));

            if (meta) {
                const latest = coordinates[coordinates.length - 1]?.value || 0;
                const previous = coordinates[coordinates.length - 2]?.value || 0;
                const delta = latest - previous;
                meta.textContent = delta === 0
                    ? `Latest activity stable at ${latest} predictions.`
                    : delta > 0
                      ? `Prediction activity increased by ${delta} vs previous point.`
                      : `Prediction activity decreased by ${Math.abs(delta)} vs previous point.`;
            }

            const linePath = coordinates.map((c, i) => `${i === 0 ? "M" : "L"}${c.x},${c.y}`).join(" ");
            const areaPath = `${linePath} L ${coordinates[coordinates.length - 1].x},${height - padY} L ${coordinates[0].x},${height - padY} Z`;

            svg.innerHTML = `
                <defs>
                    <linearGradient id="trendGradientFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="rgba(34,211,238,0.45)"/>
                        <stop offset="100%" stop-color="rgba(34,211,238,0.03)"/>
                    </linearGradient>
                </defs>
                <path d="${areaPath}" fill="url(#trendGradientFill)"></path>
                <path d="${linePath}" fill="none" stroke="#22d3ee" stroke-width="3" stroke-linecap="round"></path>
                ${coordinates
                    .map(
                        (c) =>
                            `<circle cx="${c.x}" cy="${c.y}" r="4" fill="#0ea5e9"><title>${c.label}: ${c.value}</title></circle>`
                    )
                    .join("")}
                ${coordinates
                    .filter((_, i) => i === 0 || i === coordinates.length - 1 || i % 2 === 0)
                    .map(
                        (c) =>
                            `<text x="${c.x}" y="${height - 6}" font-size="10" text-anchor="middle" fill="currentColor" opacity="0.72">${c.label.slice(5)}</text>`
                    )
                    .join("")}
            `;
        };

        const renderFeatureImpacts = (payload) => {
            const rows = Array.isArray(payload?.feature_impacts) ? payload.feature_impacts : [];
            const nodeList = document.getElementById("featureImpactChart");
            if (!nodeList) return;

            if (!rows.length) {
                nodeList.innerHTML = "<p class='muted'>No feature impact data available yet.</p>";
                return;
            }

            nodeList.innerHTML = rows
                .map((row) => {
                    const score = Math.min(100, Math.max(0, Number(row.score || 0)));
                    return `
                        <div class="analyst-impact-row">
                            <div class="analyst-impact-head">
                                <strong>${row.feature || "Feature"}</strong>
                                <span>${score.toFixed(1)}</span>
                            </div>
                            <div class="analyst-impact-track"><span style="width:${score}%"></span></div>
                            <small class="muted">High mean: ${Number(row.high_mean || 0).toFixed(2)} | Low mean: ${Number(row.low_mean || 0).toFixed(2)}</small>
                        </div>
                    `;
                })
                .join("");
        };

        const renderRecentTable = (payload) => {
            const rows = Array.isArray(payload?.recent_predictions) ? payload.recent_predictions : [];
            const tbody = document.getElementById("analystRecentTableBody");
            if (!tbody) return;

            if (!rows.length) {
                tbody.innerHTML = "<tr><td colspan='6' class='muted'>No predictions yet.</td></tr>";
                return;
            }

            tbody.innerHTML = rows
                .map((row) => {
                    const risk = String(row.risk_level || "Low");
                    const riskClass = risk.toLowerCase();
                    return `
                        <tr>
                            <td>${row.CustomerId || "-"}</td>
                            <td>${Number(row.CreditScore || 0).toFixed(0)}</td>
                            <td>${Number(row.Balance || 0).toLocaleString()}</td>
                            <td>${Number(row.probability || 0).toFixed(2)}%</td>
                            <td><span class="badge ${riskClass}">${risk}</span></td>
                            <td>${row.date_display || formatDateTimeDisplay(row.date)}</td>
                        </tr>
                    `;
                })
                .join("");
        };

        const renderAlerts = (payload) => {
            const alerts = Array.isArray(payload?.risk_alerts) ? payload.risk_alerts : [];
            const wrap = document.getElementById("riskAlertsList");
            const summary = document.getElementById("riskAlertsSummary");
            if (!wrap) return;

            if (!alerts.length) {
                wrap.innerHTML = "<p class='muted'>No risk alerts available.</p>";
                if (summary) summary.textContent = "Monitoring high-risk, prediction spikes, and inactivity.";
                return;
            }

            if (summary) {
                const highCount = alerts.filter((item) => String(item?.severity || "").toLowerCase() === "high").length;
                summary.textContent = highCount
                    ? `${highCount} high-priority risk alert${highCount > 1 ? "s" : ""} require attention.`
                    : "No high-priority alerts right now.";
            }

            wrap.innerHTML = alerts
                .map((alert) => {
                    const severity = String(alert.severity || "low").toLowerCase();
                    const icon = severity === "high" ? "fa-triangle-exclamation" : severity === "medium" ? "fa-bell" : "fa-circle-info";
                    return `
                        <article class="analyst-alert ${severity}">
                            <div class="analyst-alert-icon"><i class="fa-solid ${icon}"></i></div>
                            <div>
                                <h4>${alert.title || "Risk Alert"}</h4>
                                <p>${alert.description || ""}</p>
                            </div>
                        </article>
                    `;
                })
                .join("");
        };

        const renderAll = (payload) => {
            renderUpdatedAt(payload?.generated_at);
            renderKpis(payload);
            renderDonut(payload);
            renderTrend(payload);
            renderFeatureImpacts(payload);
            renderRecentTable(payload);
            renderAlerts(payload);
        };

        const estimateChurnFromSimulator = (input) => {
            let score = 8;

            if (input.creditScore < 450) score += 34;
            else if (input.creditScore < 600) score += 18;

            if (input.balance < 10000) score += 20;
            else if (input.balance < 50000) score += 9;

            if (input.age > 58) score += 10;
            else if (input.age < 25) score += 6;

            if (input.tenure <= 2) score += 18;
            else if (input.tenure <= 5) score += 8;

            if (!input.hasCard) score += 12;
            if (!input.isActive) score += 22;

            if (input.salary < 30000) score += 8;

            return Math.min(99, Math.max(1, score));
        };

        const renderSimulatorResult = (probability, level, explanation) => {
            const probNode = document.getElementById("simProbabilityValue");
            const badgeNode = document.getElementById("simRiskBadge");
            const progressNode = document.getElementById("simProgressBar");
            const textNode = document.getElementById("simExplanation");
            const ringNode = document.getElementById("simRing");
            const ringText = document.getElementById("simRingText");
            const label = riskLabel(level);

            if (probNode) probNode.textContent = `${Number(probability).toFixed(1)}%`;
            if (ringText) ringText.textContent = `${Number(probability).toFixed(0)}%`;
            if (progressNode) progressNode.style.width = `${Math.min(100, Math.max(0, Number(probability)))}%`;
            if (ringNode) ringNode.style.setProperty("--risk-percent", `${Math.min(100, Math.max(0, Number(probability)))}%`);

            if (badgeNode) {
                badgeNode.className = `badge ${level}`;
                badgeNode.textContent = label;
            }

            if (textNode) {
                textNode.textContent = explanation ||
                    (level === "high"
                        ? "High churn likelihood detected. Recommend immediate retention intervention."
                        : level === "medium"
                          ? "Moderate churn risk. Recommend proactive engagement and closer monitoring."
                          : "Low churn risk. Profile appears stable with healthy engagement indicators.");
            }
        };

        const initSimulator = () => {
            const form = document.getElementById("churnSimulatorForm");
            if (!form) return;

            form.addEventListener("submit", async (event) => {
                event.preventDefault();
                const input = {
                    age: Number(document.getElementById("simAge")?.value || 0),
                    creditScore: Number(document.getElementById("simCreditScore")?.value || 0),
                    balance: Number(document.getElementById("simBalance")?.value || 0),
                    tenure: Number(document.getElementById("simTenure")?.value || 0),
                    hasCard: Number(document.getElementById("simHasCard")?.value || 1) === 1,
                    isActive: Number(document.getElementById("simIsActive")?.value || 1) === 1,
                    salary: Number(document.getElementById("simSalary")?.value || 0),
                };

                const payload = {
                    Age: input.age,
                    CreditScore: input.creditScore,
                    Balance: input.balance,
                    Tenure: input.tenure,
                    HasCrCard: input.hasCard ? 1 : 0,
                    IsActiveMember: input.isActive ? 1 : 0,
                    EstimatedSalary: input.salary,
                };

                try {
                    const response = await fetch("/analyst/simulate", {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            Accept: "application/json",
                        },
                        body: JSON.stringify(payload),
                    });

                    if (response.ok) {
                        const result = await response.json();
                        const probability = Number(result?.probability || 0);
                        const risk = String(result?.risk_level || "Low").toLowerCase();
                        renderSimulatorResult(probability, risk, String(result?.explanation || ""));
                        return;
                    }
                } catch {
                    // Fall back to client-side estimation if API is unavailable.
                }

                const probability = estimateChurnFromSimulator(input);
                const level = getRiskLevel(probability);
                renderSimulatorResult(
                    probability,
                    level,
                    level === "high"
                        ? "High churn likelihood: low activity or weak product linkage suggests immediate retention intervention."
                        : level === "medium"
                          ? "Moderate churn risk: monitor engagement and use proactive customer outreach to reduce attrition."
                          : "Low churn risk: profile appears stable with healthy engagement indicators."
                );
            });
        };

        const refreshFromServer = async () => {
            try {
                const response = await fetch("/analyst/dashboard/data", {
                    headers: { Accept: "application/json" },
                    cache: "no-store",
                });
                if (!response.ok) return;
                const latest = await response.json();
                data = latest || {};
                renderAll(data);
            } catch {
                // Keep previous render in place when network request fails.
            }
        };

        const initRefreshControls = () => {
            const btn = document.getElementById("analystRefreshBtn");
            if (btn) {
                btn.addEventListener("click", () => {
                    refreshFromServer();
                });
            }

            document.addEventListener("visibilitychange", () => {
                if (document.visibilityState === "visible") {
                    refreshFromServer();
                }
            });

            window.addEventListener("focus", () => {
                refreshFromServer();
            });
        };

        renderAll(data);
        initSimulator();
        initRefreshControls();

        window.setInterval(() => {
            refreshFromServer();
        }, 8000);
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
