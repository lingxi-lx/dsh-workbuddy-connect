window.__ModuleLoader__.load({
	id: "@jojoman2024/dsh-workbuddy-connect-patched",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/status-paths.ts
		/** Node-free constants and types shared by the Host and browser halves. */
		/** Plugin-owned status endpoint consumed by its browser half. */
		const WORKBUDDY_STATUS_PATH = "/plugins/dsh-workbuddy-connect/status";
		/** Plugin-owned endpoint that persists the TinyFish API key into DSH's official
		*  local credential store (`ctx.credentials`), consumed by the plugin card. */
		const WORKBUDDY_SET_KEY_PATH = "/plugins/dsh-workbuddy-connect/set-tinyfish-key";
		/** Plugin-owned endpoint that persists the web-search engine mode, consumed by the card. */
		const WORKBUDDY_SET_MODE_PATH = "/plugins/dsh-workbuddy-connect/set-search-mode";
		/** Plugin-owned endpoint that re-fetches the model catalog from the upstream,
		*  consumed by the card's Refresh button. */
		const WORKBUDDY_REFRESH_PATH = "/plugins/dsh-workbuddy-connect/refresh";
		//#endregion
		//#region src/client/WorkBuddyPluginCard.tsx
		/** WorkBuddy status card contributed to Harness Plugin configuration. */
		const POLL_INTERVAL_MS = 6e4;
		/** Password-mode placeholder shown in the API-Key field when a key is already saved. */
		const KEY_MASK = "•".repeat(20);
		const cardStyle = {
			overflow: "hidden",
			listStyle: "none",
			border: "1px solid var(--dsw-alias-border-l2)",
			borderRadius: 12,
			background: "var(--dsw-alias-bg-layer-3)",
			transition: "border-color .16s, background .16s"
		};
		const cardOpenStyle = {
			background: "var(--dsw-alias-bg-layer-2)",
			borderColor: "var(--dsw-alias-label-dimmed)"
		};
		const headerStyle = {
			boxSizing: "border-box",
			width: "100%",
			display: "flex",
			alignItems: "center",
			justifyContent: "space-between",
			gap: 12,
			border: 0,
			borderRadius: 12,
			padding: "14px 16px",
			background: "transparent",
			color: "var(--dsw-alias-label-primary)",
			font: "inherit",
			textAlign: "left",
			cursor: "pointer"
		};
		const headTextStyle = {
			display: "flex",
			minWidth: 0,
			flex: 1,
			flexDirection: "column",
			gap: 4
		};
		const nameStyle = {
			fontSize: 15,
			lineHeight: 1.4,
			fontWeight: 600,
			color: "var(--dsw-alias-label-primary)"
		};
		const descriptionStyle = {
			fontSize: 13,
			lineHeight: 1.5,
			color: "var(--dsw-alias-label-tertiary)"
		};
		const chevronStyle = {
			flex: "none",
			fontSize: 18,
			lineHeight: 1,
			color: "var(--dsw-alias-label-tertiary)",
			transition: "transform .16s"
		};
		const cardBodyStyle = {
			borderTop: "1px solid var(--dsw-alias-border-l2)",
			padding: "0 16px 8px"
		};
		const fieldStyle = {
			display: "flex",
			flexDirection: "column",
			gap: 6,
			padding: "12px 0"
		};
		const fieldHeadStyle = {
			display: "flex",
			alignItems: "center",
			gap: 8,
			justifyContent: "space-between"
		};
		const fieldLabelStyle = {
			minWidth: 0,
			flex: 1,
			color: "var(--dsw-alias-label-primary)",
			fontSize: 13,
			fontWeight: 500,
			lineHeight: 1.5
		};
		const fieldInputStyle = {
			boxSizing: "border-box",
			width: "100%",
			border: "1px solid var(--dsw-alias-border-l2)",
			background: "var(--dsw-alias-bg-layer-3)",
			height: 34,
			font: "inherit",
			color: "var(--dsw-alias-label-primary)",
			borderRadius: 8,
			padding: "0 12px",
			fontSize: 13,
			lineHeight: 1.5,
			outline: "none"
		};
		const fieldHintStyle = {
			margin: 0,
			color: "var(--dsw-alias-label-tertiary)",
			fontSize: 12,
			lineHeight: 1.5
		};
		const sectionDividerStyle = { borderTop: "1px solid var(--dsw-alias-border-l2)" };
		const badgeStyle = {
			whiteSpace: "nowrap",
			background: "var(--dsw-alias-bg-module-platform)",
			color: "var(--dsw-alias-label-secondary)",
			borderRadius: 999,
			padding: "1px 8px",
			fontSize: 11,
			fontWeight: 500,
			lineHeight: "17px",
			flex: "none"
		};
		const footerStyle = {
			borderTop: "1px solid var(--dsw-alias-border-l2)",
			display: "flex",
			justifyContent: "flex-end",
			alignItems: "center",
			gap: 8,
			padding: "12px 0"
		};
		const saveButtonStyle = {
			appearance: "none",
			font: "inherit",
			cursor: "pointer",
			border: "1px solid transparent",
			borderRadius: 8,
			padding: "5px 14px",
			fontSize: 13,
			lineHeight: 1.5,
			background: "var(--dsw-alias-label-primary)",
			color: "var(--dsw-alias-bg-layer-1)"
		};
		const secondaryButtonStyle = {
			appearance: "none",
			font: "inherit",
			cursor: "pointer",
			background: "transparent",
			border: "1px solid var(--dsw-alias-border-l2)",
			borderRadius: 8,
			padding: "5px 14px",
			fontSize: 13,
			lineHeight: 1.5,
			color: "var(--dsw-alias-label-secondary)"
		};
		const modeGroupStyle = {
			display: "flex",
			flexDirection: "column",
			gap: 4,
			marginTop: 4
		};
		const modeRowStyle = {
			display: "flex",
			alignItems: "flex-start",
			justifyContent: "space-between",
			gap: 12,
			padding: "8px 0"
		};
		const modeTextStyle = {
			display: "flex",
			flexDirection: "column",
			gap: 2,
			minWidth: 0
		};
		const modeTitleStyle = {
			fontSize: 13,
			lineHeight: 1.5,
			fontWeight: 500,
			color: "var(--dsw-alias-label-primary)"
		};
		const modeDescStyle = {
			fontSize: 12,
			lineHeight: 1.5,
			color: "var(--dsw-alias-label-tertiary)"
		};
		const modeInputStyle = {
			flex: "none",
			marginTop: 1,
			width: 16,
			height: 16,
			accentColor: "var(--dsw-alias-label-primary)",
			cursor: "pointer"
		};
		const refreshButtonStyle = {
			appearance: "none",
			font: "inherit",
			cursor: "pointer",
			background: "transparent",
			border: 0,
			padding: 0,
			color: "var(--dsw-alias-label-secondary)",
			fontSize: 12,
			lineHeight: 1.5
		};
		const statusStyle = {
			display: "flex",
			alignItems: "center",
			gap: 9,
			fontSize: 13,
			lineHeight: 1.5,
			color: "var(--dsw-alias-label-primary)"
		};
		const totalValueStyle = {
			color: "var(--dsw-alias-label-secondary)",
			fontSize: 13,
			lineHeight: 1.5
		};
		const errorStyle = {
			...fieldHintStyle,
			color: "var(--dsw-alias-state-error-primary)"
		};
		const successStyle = {
			...fieldHintStyle,
			color: "var(--dsw-alias-state-success-primary, #22a06b)"
		};
		const modelsTableStyle = {
			display: "flex",
			flexDirection: "column",
			gap: 8
		};
		const modelRowStyle = {
			display: "flex",
			alignItems: "center",
			justifyContent: "space-between",
			gap: 12,
			fontSize: 13,
			lineHeight: "20px",
			color: "var(--dsw-alias-label-secondary)"
		};
		const modelNameStyle = {
			flex: "0 0 auto",
			fontWeight: 500,
			color: "var(--dsw-alias-label-primary)"
		};
		const modelMetaStyle = {
			display: "flex",
			alignItems: "center",
			gap: 12,
			flexWrap: "wrap",
			justifyContent: "flex-end"
		};
		const modelCreditsStyle = {
			color: "var(--dsw-alias-label-caption)",
			fontVariantNumeric: "tabular-nums"
		};
		const modelEffortStyle = {
			color: "var(--dsw-alias-label-caption)",
			fontVariantNumeric: "tabular-nums"
		};
		function dotStyle(status) {
			return {
				width: 9,
				height: 9,
				borderRadius: "50%",
				flex: "0 0 auto",
				background: status === "signed-in" ? "var(--dsw-alias-state-success-primary, #22a06b)" : status === "error" ? "var(--dsw-alias-state-error-primary, #d92d20)" : "var(--dsw-alias-label-dimmed, #9aa0a6)"
			};
		}
		function formatNumber(value) {
			return new Intl.NumberFormat(void 0).format(value);
		}
		/** Normalize a credits string like "x0.00 credits" into "0.00x". */
		function formatCredits(credits) {
			if (credits === void 0) return "";
			const match = /x(\d+(?:\.\d+)?)/.exec(credits);
			return match === null ? credits : `${match[1]}x`;
		}
		/** Localized label for a WorkBuddy reasoning effort. */
		function effortLabel(effort, t) {
			switch (effort) {
				case "off": return t("effortOff");
				case "low": return t("effortLow");
				case "medium": return t("effortMedium");
				case "high": return t("effortHigh");
				default: return effort ?? "";
			}
		}
		function formatTime(ms) {
			return new Intl.DateTimeFormat(void 0, {
				dateStyle: "medium",
				timeStyle: "short"
			}).format(new Date(ms));
		}
		/** Render WorkBuddy sign-in state, credit, web-search key, and models as one expandable card. */
		function WorkBuddyPluginCard({ t }) {
			if (t === void 0) throw new Error("WorkBuddy plugin card requires its translation function");
			const [open, setOpen] = (0, react.useState)(false);
			const [status, setStatus] = (0, react.useState)({ status: "signed-out" });
			const [busy, setBusy] = (0, react.useState)(false);
			const [keyConfigured, setKeyConfigured] = (0, react.useState)(false);
			const [keyInput, setKeyInput] = (0, react.useState)("");
			const [keyInputDirty, setKeyInputDirty] = (0, react.useState)(false);
			const [saving, setSaving] = (0, react.useState)(false);
			const [saveMsg, setSaveMsg] = (0, react.useState)(null);
			const [searchMode, setSearchMode] = (0, react.useState)("auto");
			const mounted = (0, react.useRef)(true);
			(0, react.useEffect)(() => {
				mounted.current = true;
				return () => {
					mounted.current = false;
				};
			}, []);
			const refresh = (0, react.useCallback)(async (signal) => {
				try {
					const response = await fetch(WORKBUDDY_STATUS_PATH, {
						headers: { accept: "application/json" },
						credentials: "same-origin",
						...signal === void 0 ? {} : { signal }
					});
					const value = await response.json().catch(() => void 0);
					if (!response.ok) throw new Error(`HTTP ${response.status}`);
					if (mounted.current && signal?.aborted !== true) {
						const s = value;
						setStatus(s);
						setKeyConfigured(s.tinyfishKeyConfigured === true);
						setKeyInputDirty(false);
						if (s.searchMode !== void 0) setSearchMode(s.searchMode);
					}
				} catch (error) {
					if (mounted.current && signal?.aborted !== true) setStatus({
						status: "error",
						message: error instanceof Error ? error.message : t("requestFailed")
					});
				}
			}, [t]);
			(0, react.useEffect)(() => {
				if (!open) return;
				const controller = new AbortController();
				refresh(controller.signal);
				return () => {
					controller.abort();
				};
			}, [open, refresh]);
			(0, react.useEffect)(() => {
				if (!open || status.status !== "signed-in") return;
				const controller = new AbortController();
				const timer = window.setInterval(() => {
					refresh(controller.signal);
				}, POLL_INTERVAL_MS);
				return () => {
					window.clearInterval(timer);
					controller.abort();
				};
			}, [
				open,
				refresh,
				status.status
			]);
			const manualRefresh = async () => {
				setBusy(true);
				setSaveMsg(null);
				try {
					const response = await fetch(WORKBUDDY_REFRESH_PATH, {
						method: "POST",
						headers: { accept: "application/json" },
						credentials: "same-origin"
					});
					const result = await response.json().catch(() => null);
					if (response.ok && result?.ok === true) setSaveMsg({
						type: "ok",
						text: t("refreshDone", { count: String(result.modelCount) })
					});
					else {
						const detail = result?.ok === false ? result.error : `HTTP ${response.status}`;
						setSaveMsg({
							type: "err",
							text: t("refreshFailed", { message: detail })
						});
					}
				} catch (error) {
					setSaveMsg({
						type: "err",
						text: t("refreshFailed", { message: error instanceof Error ? error.message : t("requestFailed") })
					});
				} finally {
					await refresh();
					if (mounted.current) setBusy(false);
				}
			};
			const saveKey = async () => {
				const key = keyInput.trim();
				if (key.length === 0 || key === KEY_MASK) return;
				setSaving(true);
				setSaveMsg(null);
				try {
					const response = await fetch(WORKBUDDY_SET_KEY_PATH, {
						method: "POST",
						headers: {
							"content-type": "application/json",
							accept: "application/json"
						},
						credentials: "same-origin",
						body: JSON.stringify({ key })
					});
					if (!response.ok) {
						const detail = await response.json().catch(() => null);
						throw new Error(detail?.error ? String(detail.error) : `HTTP ${response.status}`);
					}
					setKeyInput("");
					setKeyInputDirty(false);
					setKeyConfigured(true);
					setSaveMsg({
						type: "ok",
						text: t("keySaved")
					});
					refresh();
				} catch (error) {
					setSaveMsg({
						type: "err",
						text: error instanceof Error ? error.message : t("keySaveFailed")
					});
				} finally {
					if (mounted.current) setSaving(false);
				}
			};
			const manifestMode = async (mode) => {
				setSearchMode(mode);
				try {
					const response = await fetch(WORKBUDDY_SET_MODE_PATH, {
						method: "POST",
						headers: {
							"content-type": "application/json",
							accept: "application/json"
						},
						credentials: "same-origin",
						body: JSON.stringify({ mode })
					});
					if (!response.ok) {
						const detail = await response.json().catch(() => null);
						throw new Error(detail?.error ? String(detail.error) : `HTTP ${response.status}`);
					}
				} catch (error) {
					setSaveMsg({
						type: "err",
						text: error instanceof Error ? error.message : t("keySaveFailed")
					});
				}
			};
			const title = t("title");
			const label = status.status === "signed-in" ? status.nickname === void 0 ? t("signedInAs", { nickname: "" }).replace(/[:：]\s*$/, "") : t("signedInAs", { nickname: status.nickname }) : status.status === "error" ? t("requestFailed") : t("signedOut");
			const displayKey = keyConfigured && !keyInputDirty ? KEY_MASK : keyInput;
			const canSave = keyInputDirty && keyInput.trim().length > 0 && keyInput !== KEY_MASK;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
				style: {
					...cardStyle,
					...open ? cardOpenStyle : null
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					style: headerStyle,
					"aria-expanded": open,
					"aria-label": `${t(open ? "collapse" : "expand")}: ${title}`,
					onClick: () => {
						setOpen(!open);
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						style: headTextStyle,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: nameStyle,
							children: title
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: descriptionStyle,
							children: t("intro")
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						"aria-hidden": "true",
						style: {
							...chevronStyle,
							transform: open ? "rotate(180deg)" : "none"
						},
						children: "⌄"
					})]
				}), open ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: cardBodyStyle,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: fieldStyle,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									style: fieldHeadStyle,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: fieldLabelStyle,
										children: t("accountHeading")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										style: refreshButtonStyle,
										disabled: busy,
										onClick: () => {
											manualRefresh();
										},
										children: busy ? t("refreshing") : t("refresh")
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									style: statusStyle,
									role: "status",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										"aria-hidden": "true",
										style: dotStyle(status.status)
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: label })]
								}),
								status.status === "signed-in" && status.expiresAt !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									style: fieldHintStyle,
									children: t("accessTokenExpires", { time: formatTime(status.expiresAt) })
								}) : null,
								status.status === "signed-out" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									style: fieldHintStyle,
									children: t("signedOutHint")
								}) : null,
								status.status === "error" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									style: errorStyle,
									children: status.message
								}) : null
							]
						}),
						status.status === "signed-in" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: sectionDividerStyle,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: fieldStyle,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									style: fieldHeadStyle,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: fieldLabelStyle,
										children: t("creditsHeading")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: totalValueStyle,
										children: status.credits === void 0 ? "" : t("creditsTotal", { total: formatNumber(status.credits.total) })
									})]
								}), status.creditsError === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									style: errorStyle,
									children: t("creditsError", { message: status.creditsError })
								})]
							})
						}) : null,
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: sectionDividerStyle,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: fieldStyle,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										style: fieldHeadStyle,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											style: fieldLabelStyle,
											children: t("tinyfishKeyLabel")
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											style: badgeStyle,
											children: keyConfigured ? t("keyConfigured") : t("keyNotConfigured")
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										type: "password",
										value: displayKey,
										placeholder: t("tinyfishKeyPlaceholder"),
										"aria-label": t("tinyfishKeyLabel"),
										onChange: (e) => {
											setKeyInput(e.target.value);
											setKeyInputDirty(true);
											setSaveMsg(null);
										},
										style: fieldInputStyle
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										style: fieldHintStyle,
										children: keyConfigured ? t("keyConfiguredHint") : t("keyNotConfiguredHint")
									}),
									keyConfigured ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										style: modeGroupStyle,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											style: fieldLabelStyle,
											children: t("engineModeHeading")
										}), [
											"auto",
											"tinyfish-global",
											"system-global"
										].map((mode) => {
											const titleKey = mode === "auto" ? "modeAutoTitle" : mode === "tinyfish-global" ? "modeTinyFishTitle" : "modeSystemTitle";
											const descKey = mode === "auto" ? "modeAutoDesc" : mode === "tinyfish-global" ? "modeTinyFishDesc" : "modeSystemDesc";
											return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
												style: modeRowStyle,
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
													style: modeTextStyle,
													children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														style: modeTitleStyle,
														children: t(titleKey)
													}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														style: modeDescStyle,
														children: t(descKey)
													})]
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
													type: "radio",
													name: "workbuddy-search-mode",
													checked: searchMode === mode,
													onChange: () => {
														manifestMode(mode);
													},
													style: modeInputStyle
												})]
											}, mode);
										})]
									}) : null,
									saveMsg === null ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										style: saveMsg.type === "ok" ? successStyle : errorStyle,
										children: saveMsg.text
									})
								]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: footerStyle,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									style: secondaryButtonStyle,
									onClick: () => {
										window.open("https://agent.tinyfish.ai/api-keys", "_blank", "noopener");
									},
									children: t("getTinyFishKey")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									style: saveButtonStyle,
									disabled: saving || !canSave,
									onClick: () => {
										saveKey();
									},
									children: saving ? t("saving") : t("save")
								})]
							})]
						}),
						status.status === "signed-in" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: sectionDividerStyle,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: fieldStyle,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									style: fieldHeadStyle,
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: fieldLabelStyle,
										children: t("modelsHeading")
									})
								}), status.models === void 0 || status.models.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									style: fieldHintStyle,
									children: t("noModelsHint")
								}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									style: modelsTableStyle,
									children: status.models.map((model) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										style: modelRowStyle,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											style: modelNameStyle,
											children: model.name
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											style: modelMetaStyle,
											children: [model.credits === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												style: modelCreditsStyle,
												children: formatCredits(model.credits)
											}), model.reasoningEffort === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
												style: modelEffortStyle,
												children: [
													t("reasoningLabel"),
													" ",
													effortLabel(model.reasoningEffort, t)
												]
											})]
										})]
									}, model.id))
								})]
							})
						}) : null
					]
				}) : null]
			});
		}
		//#endregion
		//#region src/client/locales.ts
		/** Plugin-card copy registered under the settings.workbuddy locale namespace. */
		const en = {
			title: "DSH WorkBuddy Connect",
			intro: "Use the models in the WorkBuddy desktop app directly in DSH — zero configuration, ready out of the box.",
			expand: "Expand",
			collapse: "Collapse",
			loading: "Loading account…",
			signedOut: "Not signed in",
			signedOutHint: "Sign in once in the WorkBuddy desktop app; this plugin follows that sign-in automatically.",
			signedInAs: "Signed in as {nickname}",
			accessTokenExpires: "Access token expires {time} (refresh is automatic)",
			creditsHeading: "Remaining credit",
			creditsTotal: "Total: {total}",
			percentRemaining: "{percent}% remaining",
			exactRemaining: "{remain} / {size} remaining",
			creditPackageUnknownSize: "{remain} remaining",
			creditsError: "Credit unavailable: {message}",
			refresh: "Refresh",
			refreshing: "Refreshing…",
			refreshDone: "Model catalog refreshed: {count} models",
			refreshFailed: "Model refresh failed: {message}",
			requestFailed: "Request failed",
			accountHeading: "Account",
			modelsHeading: "Models & credit multiplier",
			reasoningLabel: "Reasoning",
			effortOff: "Off",
			effortLow: "Low",
			effortMedium: "Medium",
			effortHigh: "High",
			unknownCredits: "unknown",
			noModelsHint: "Model catalog not loaded yet.",
			searchHeading: "Web search",
			tinyfishKeyLabel: "TinyFish API Key",
			tinyfishKeyPlaceholder: "Paste your TinyFish API key",
			save: "Save",
			saving: "Saving…",
			keySaved: "Saved",
			keySaveFailed: "Save failed",
			keyConfigured: "Configured",
			keyNotConfigured: "Not configured",
			keyConfiguredHint: "API KEY saved. WorkBuddy models will default to the TinyFish search engine.",
			keyNotConfiguredHint: "Enter an API KEY, otherwise the official search engine will be used.",
			getTinyFishKey: "Get a free TinyFish API",
			engineModeHeading: "Search engine",
			modeAutoTitle: "Auto-switch engine",
			modeAutoDesc: "WB models use TinyFish; other models follow the system search.",
			modeTinyFishTitle: "Always use TinyFish",
			modeTinyFishDesc: "Use TinyFish search for any model.",
			modeSystemTitle: "Always use system search",
			modeSystemDesc: "Follow the system search engine for any model."
		};
		const zh = {
			title: "DSH WorkBuddy Connect",
			intro: "在 DSH 中直接使用 WorkBuddy 桌面 App 包含的模型，开箱即用，无需额外配置。",
			expand: "展开",
			collapse: "收起",
			loading: "正在读取账号…",
			signedOut: "未登录",
			signedOutHint: "在 WorkBuddy 桌面 App 里登录一次即可，插件会自动跟随当前登录的账号。",
			signedInAs: "已登录：{nickname}",
			accessTokenExpires: "访问令牌 {time} 过期（自动续期）",
			creditsHeading: "剩余积分",
			creditsTotal: "合计：{total}",
			percentRemaining: "剩余 {percent}%",
			exactRemaining: "剩余 {remain} / {size}",
			creditPackageUnknownSize: "剩余 {remain}",
			creditsError: "积分查询失败：{message}",
			refresh: "刷新",
			refreshing: "正在刷新…",
			refreshDone: "模型目录已刷新：{count} 个模型",
			refreshFailed: "模型刷新失败：{message}",
			requestFailed: "请求失败",
			accountHeading: "账号",
			modelsHeading: "模型与倍率",
			reasoningLabel: "思考强度",
			effortOff: "关闭",
			effortLow: "低",
			effortMedium: "中",
			effortHigh: "高",
			unknownCredits: "未知",
			noModelsHint: "模型目录尚未加载。",
			searchHeading: "联网搜索",
			tinyfishKeyLabel: "TinyFish API Key",
			tinyfishKeyPlaceholder: "粘贴你的 TinyFish API Key",
			save: "保存",
			saving: "保存中…",
			keySaved: "已保存",
			keySaveFailed: "保存失败",
			keyConfigured: "已配置",
			keyNotConfigured: "未配置",
			keyConfiguredHint: "已保存 API KEY，使用 WB 模型时默认使用 TinyFish 搜索引擎",
			keyNotConfiguredHint: "请输入 API KEY，否则使用官方搜索引擎",
			getTinyFishKey: "获取 TinyFish 免费API",
			engineModeHeading: "搜索引擎",
			modeAutoTitle: "自动切换引擎",
			modeAutoDesc: "WB 模型使用 TinyFish，其他跟随系统搜索",
			modeTinyFishTitle: "全局使用 TinyFish",
			modeTinyFishDesc: "使用任何模型都使用 TinyFish 搜索",
			modeSystemTitle: "全局使用系统搜索",
			modeSystemDesc: "使用任何模型都跟随系统搜索"
		};
		//#endregion
		//#region src/client/index.tsx
		/** Stable browser-plugin name. */
		const name = "dsh-workbuddy-connect-client";
		/** Client services required by the Plugin configuration contribution. */
		const inject = ["slots", "locale"];
		/**
		* Register card copy and the WorkBuddy card under Plugin configuration.
		*
		* The entire body is wrapped so that a DSH slot-API breaking change (for
		* example the rc.6→rc.7 `id`→`key` / `order`→`priority` rename) degrades
		* to a `console.error` instead of throwing into the DSH loader and raising
		* the red "Failed to load plugins" banner. The host provider keeps working:
		* the `workbuddy` model channel is unaffected, and `dsh-workbuddy-connect
		* status` reports host health via the heartbeat file.
		*
		* NOTE: the try/catch boundary of this function is mirrored (duplicated) in
		* `tests/client-fallback.spec.ts`, because the real client entry imports
		* browser-only DSH packages that cannot load in the Node test environment.
		* That test therefore does not import this function — it replicates its
		* shape. If you change the guarded body or the `console.error` message here,
		* update the mirrored `apply()` in that spec too, or the fallback test will
		* silently diverge from this real implementation.
		*/
		function apply(ctx) {
			try {
				const namespace = "settings.workbuddy";
				ctx.effect(() => ctx.locale.register(namespace, {
					zh,
					en
				}), "dsh-workbuddy-connect: settings copy");
				const t = ctx.locale.bind(namespace);
				ctx.slots.inject("settings.plugin.item", () => ctx.slots.register({
					name: "settings.plugin.item",
					key: "workbuddy",
					priority: 30,
					inject: () => ({ t })
				}, WorkBuddyPluginCard));
			} catch (error) {
				console.error("[dsh-workbuddy-connect] client card failed to load (host provider unaffected):", error);
			}
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	}
});
