//#region \0rolldown/runtime.js
var __defProp = Object.defineProperty;
var __exportAll = (all, no_symbols) => {
	let target = {};
	for (var name in all) {
		__defProp(target, name, {
			get: all[name],
			enumerable: true
		});
	}
	if (!no_symbols) {
		__defProp(target, Symbol.toStringTag, { value: "Module" });
	}
	return target;
};

//#endregion
//#region src/engine/generated/worker/engine.js
var engine_exports = /* @__PURE__ */ __exportAll({ instantiate: () => instantiate });
function instantiate(getCoreModule, imports, instantiateCore = WebAssembly.instantiate) {
	function promiseWithResolvers() {
		if (Promise.withResolvers) return Promise.withResolvers();
		else {
			let resolve;
			let reject;
			return {
				promise: new Promise((res, rej) => {
					resolve = res;
					reject = rej;
				}),
				resolve,
				reject
			};
		}
	}
	const symbolDispose = Symbol.dispose || Symbol.for("dispose");
	Symbol.asyncIterator;
	Symbol.iterator;
	const _debugLog = (...args) => {
		if (!globalThis?.process?.env?.JCO_DEBUG) return;
		console.debug(...args);
	};
	const ASYNC_DETERMINISM = "random";
	const GLOBAL_COMPONENT_MEMORY_MAP = /* @__PURE__ */ new Map();
	const CURRENT_TASK_META = {};
	function _getGlobalCurrentTaskMeta(componentIdx) {
		if (componentIdx === null || componentIdx === void 0) throw new Error("missing/invalid component idx");
		const v = CURRENT_TASK_META[componentIdx];
		if (v === void 0 || v === null) return;
		return { ...v };
	}
	function _setGlobalCurrentTaskMeta(args) {
		if (!args) throw new TypeError("args missing");
		if (args.taskID === void 0) throw new TypeError("missing task ID");
		if (args.componentIdx === void 0) throw new TypeError("missing component idx");
		const { taskID, componentIdx } = args;
		return CURRENT_TASK_META[componentIdx] = {
			taskID,
			componentIdx
		};
	}
	function _withGlobalCurrentTaskMeta(args) {
		_debugLog("[_withGlobalCurrentTaskMeta()] args", args);
		if (!args) throw new TypeError("args missing");
		if (args.taskID === void 0) throw new TypeError("missing task ID");
		if (args.componentIdx === void 0) throw new TypeError("missing component idx");
		if (!args.fn) throw new TypeError("missing fn");
		const { taskID, componentIdx, fn } = args;
		try {
			CURRENT_TASK_META[componentIdx] = {
				taskID,
				componentIdx
			};
			return fn();
		} catch (err) {
			_debugLog("error while executing sync callee/callback", {
				...args,
				err
			});
			throw err;
		} finally {
			CURRENT_TASK_META[componentIdx] = null;
		}
	}
	async function _withGlobalCurrentTaskMetaAsync(args) {
		_debugLog("[_withGlobalCurrentTaskMetaAsync()] args", args);
		if (!args) throw new TypeError("args missing");
		if (args.taskID === void 0) throw new TypeError("missing task ID");
		if (args.componentIdx === void 0) throw new TypeError("missing component idx");
		if (!args.fn) throw new TypeError("missing fn");
		const { taskID, componentIdx, fn } = args;
		try {
			CURRENT_TASK_META[componentIdx] = {
				taskID,
				componentIdx
			};
			return await fn();
		} catch (err) {
			_debugLog("error while executing async callee/callback", {
				...args,
				err
			});
			throw err;
		} finally {
			CURRENT_TASK_META[componentIdx] = null;
		}
	}
	async function _clearCurrentTask(args) {
		_debugLog("[_clearCurrentTask()] args", args);
		if (!args) throw new TypeError("args missing");
		if (args.taskID === void 0) throw new TypeError("missing task ID");
		if (args.componentIdx === void 0) throw new TypeError("missing component idx");
		const { taskID, componentIdx } = args;
		const meta = CURRENT_TASK_META[componentIdx];
		if (!meta) throw new Error(`missing current task meta for component idx [${componentIdx}]`);
		if (meta.taskID !== taskID) throw new Error(`task ID [${meta.taskID}] != requested ID [${taskID}]`);
		if (meta.componentIdx !== componentIdx) throw new Error(`component idx [${meta.componentIdx}] != requested idx [${componentIdx}]`);
		CURRENT_TASK_META[componentIdx] = null;
	}
	function lookupMemoriesForComponent(args) {
		const { componentIdx } = args ?? {};
		if (args.componentIdx === void 0) throw new TypeError("missing component idx");
		const metas = GLOBAL_COMPONENT_MEMORY_MAP.get(componentIdx);
		if (!metas) return [];
		if (args.memoryIdx === void 0) return Object.values(metas);
		return metas[args.memoryIdx]?.memory;
	}
	class RepTable {
		#data = [0, null];
		#size = 0;
		#target;
		constructor(args) {
			this.target = args?.target;
		}
		data() {
			return this.#data;
		}
		insert(val) {
			_debugLog("[RepTable#insert()] args", {
				val,
				target: this.target
			});
			const freeIdx = this.#data[0];
			if (freeIdx === 0) {
				this.#data.push(val);
				this.#data.push(null);
				const rep = (this.#data.length >> 1) - 1;
				_debugLog("[RepTable#insert()] inserted", {
					val,
					target: this.target,
					rep
				});
				this.#size += 1;
				return rep;
			}
			this.#data[0] = this.#data[freeIdx << 1];
			const placementIdx = freeIdx << 1;
			this.#data[placementIdx] = val;
			this.#data[placementIdx + 1] = null;
			_debugLog("[RepTable#insert()] inserted", {
				val,
				target: this.target,
				rep: freeIdx
			});
			this.#size += 1;
			return freeIdx;
		}
		get(rep) {
			_debugLog("[RepTable#get()] args", {
				rep,
				target: this.target
			});
			if (rep === 0) throw new Error("invalid resource rep during get, (cannot be 0)");
			const baseIdx = rep << 1;
			return this.#data[baseIdx];
		}
		contains(rep) {
			_debugLog("[RepTable#contains()] args", {
				rep,
				target: this.target
			});
			if (rep === 0) throw new Error("invalid resource rep during contains, (cannot be 0)");
			const baseIdx = rep << 1;
			return !!this.#data[baseIdx];
		}
		remove(rep) {
			_debugLog("[RepTable#remove()] args", {
				rep,
				target: this.target
			});
			if (rep === 0) throw new Error("invalid resource rep during remove, (cannot be 0)");
			if (this.#data.length === 2) throw new Error("invalid");
			const baseIdx = rep << 1;
			const val = this.#data[baseIdx];
			this.#data[baseIdx] = this.#data[0];
			this.#data[0] = rep;
			this.#size -= 1;
			return val;
		}
		size() {
			return this.#size;
		}
		clear() {
			_debugLog("[RepTable#clear()] args", {
				rep,
				target: this.target
			});
			this.#data = [0, null];
		}
	}
	const _coinFlip = () => {
		return Math.random() > .5;
	};
	function _isValidNumericPrimitive(ty, v) {
		if (v === void 0 || v === null) return false;
		switch (ty) {
			case "bool": return v === 0 || v === 1;
			case "u8": return v >= 0 && v <= 255;
			case "s8": return v >= -128 && v <= 127;
			case "u16": return v >= 0 && v <= 65535;
			case "s16": return v >= -32768 && v <= 32767;
			case "u32": return v >= 0 && v <= 4294967295;
			case "s32": return v >= -2147483648 && v <= 2147483647;
			case "u64": return typeof v === "bigint" && v >= 0 && v <= 18446744073709551615n;
			case "s64": return typeof v === "bigint" && v >= -9223372036854775808n && v <= 9223372036854775807n;
			case "f32":
			case "f64": return typeof v === "number";
			default: return false;
		}
		return true;
	}
	function _requireValidNumericPrimitive(ty, v) {
		if (v === void 0 || v === null || !_isValidNumericPrimitive(ty, v)) throw new TypeError(`invalid ${ty} value [${v}]`);
		return true;
	}
	(async () => {}).constructor;
	function clearCurrentTask(componentIdx, taskID) {
		_debugLog("[clearCurrentTask()] args", {
			componentIdx,
			taskID
		});
		if (componentIdx === void 0 || componentIdx === null) throw new Error("missing/invalid component instance index while ending current task");
		const tasks = ASYNC_TASKS_BY_COMPONENT_IDX.get(componentIdx);
		if (!tasks || !Array.isArray(tasks)) throw new Error("missing/invalid tasks for component instance while ending task");
		if (tasks.length == 0) throw new Error(`no current tasks for component instance [${componentIdx}] while ending task`);
		if (taskID !== void 0) {
			if (tasks[tasks.length - 1].id !== taskID) return;
		}
		ASYNC_CURRENT_TASK_IDS.pop();
		ASYNC_CURRENT_COMPONENT_IDXS.pop();
		return tasks.pop().task;
	}
	globalThis.WebAssembly && new globalThis.WebAssembly.Global({
		value: "i32",
		mutable: true
	}, 0);
	const ASYNC_CURRENT_TASK_IDS = [];
	const ASYNC_CURRENT_COMPONENT_IDXS = [];
	class AsyncSubtask {
		static _ID = 0n;
		static State = {
			STARTING: 0,
			STARTED: 1,
			RETURNED: 2,
			CANCELLED_BEFORE_STARTED: 3,
			CANCELLED_BEFORE_RETURNED: 4
		};
		#id;
		#state = AsyncSubtask.State.STARTING;
		#componentIdx;
		#parentTask;
		#childTask = null;
		#dropped = false;
		#cancelRequested = false;
		#memoryIdx = null;
		#lenders = null;
		#waitable = null;
		#callbackFn = null;
		#callbackFnName = null;
		#postReturnFn = null;
		#onProgressFn = null;
		#pendingEventFn = null;
		#callMetadata = {};
		#resolved = false;
		#onResolveHandlers = [];
		#onStartHandlers = [];
		#result = null;
		#resultSet = false;
		fnName;
		target;
		isAsync;
		isManualAsync;
		constructor(args) {
			if (typeof args.componentIdx !== "number") throw new Error("invalid componentIdx for subtask creation");
			this.#componentIdx = args.componentIdx;
			this.#id = ++AsyncSubtask._ID;
			this.fnName = args.fnName;
			if (!args.parentTask) throw new Error("missing parent task during subtask creation");
			this.#parentTask = args.parentTask;
			if (args.childTask) this.#childTask = args.childTask;
			if (args.memoryIdx) this.#memoryIdx = args.memoryIdx;
			if (!args.waitable) throw new Error("missing/invalid waitable");
			this.#waitable = args.waitable;
			if (args.callMetadata) this.#callMetadata = args.callMetadata;
			this.#lenders = [];
			this.target = args.target;
			this.isAsync = args.isAsync;
			this.isManualAsync = args.isManualAsync;
		}
		id() {
			return this.#id;
		}
		parentTaskID() {
			return this.#parentTask?.id();
		}
		childTaskID() {
			return this.#childTask?.id();
		}
		state() {
			return this.#state;
		}
		waitable() {
			return this.#waitable;
		}
		waitableRep() {
			return this.#waitable.idx();
		}
		join() {
			return this.#waitable.join(...arguments);
		}
		getPendingEvent() {
			return this.#waitable.getPendingEvent(...arguments);
		}
		hasPendingEvent() {
			return this.#waitable.hasPendingEvent(...arguments);
		}
		setPendingEvent() {
			return this.#waitable.setPendingEvent(...arguments);
		}
		setTarget(tgt) {
			this.target = tgt;
		}
		getResult() {
			if (!this.#resultSet) throw new Error("subtask result has not been set");
			return this.#result;
		}
		setResult(v) {
			if (this.#resultSet) throw new Error("subtask result has already been set");
			this.#result = v;
			this.#resultSet = true;
		}
		componentIdx() {
			return this.#componentIdx;
		}
		setChildTask(t) {
			if (!t) throw new Error("cannot set missing/invalid child task on subtask");
			if (this.#childTask) throw new Error("child task is already set on subtask");
			if (this.#parentTask === t) throw new Error("parent cannot be child");
			this.#childTask = t;
		}
		getChildTask(t) {
			return this.#childTask;
		}
		getParentTask() {
			return this.#parentTask;
		}
		setCallbackFn(f, name) {
			if (!f) return;
			if (this.#callbackFn) throw new Error("callback fn can only be set once");
			this.#callbackFn = f;
			this.#callbackFnName = name;
		}
		getCallbackFnName() {
			if (!this.#callbackFn) return;
			return this.#callbackFn.name;
		}
		setPostReturnFn(f) {
			if (!f) return;
			if (this.#postReturnFn) throw new Error("postReturn fn can only be set once");
			this.#postReturnFn = f;
		}
		setOnProgressFn(f) {
			if (this.#onProgressFn) throw new Error("on progress fn can only be set once");
			this.#onProgressFn = f;
		}
		isNotStarted() {
			return this.#state == AsyncSubtask.State.STARTING;
		}
		registerOnStartHandler(f) {
			this.#onStartHandlers.push(f);
		}
		onStart(args) {
			_debugLog("[AsyncSubtask#onStart()] args", {
				componentIdx: this.#componentIdx,
				subtaskID: this.#id,
				parentTaskID: this.parentTaskID(),
				fnName: this.fnName,
				args
			});
			if (this.#onProgressFn) this.#onProgressFn();
			this.#state = AsyncSubtask.State.STARTED;
			let result;
			if (this.#callMetadata.startFn) result = this.#callMetadata.startFn.apply(null, args?.startFnParams ?? []);
			return result;
		}
		registerOnResolveHandler(f) {
			this.#onResolveHandlers.push(f);
		}
		reject(subtaskErr) {
			this.#childTask?.reject(subtaskErr);
		}
		onResolve(subtaskValue) {
			_debugLog("[AsyncSubtask#onResolve()] args", {
				componentIdx: this.#componentIdx,
				subtaskID: this.#id,
				isAsync: this.isAsync,
				childTaskID: this.childTaskID(),
				parentTaskID: this.parentTaskID(),
				parentTaskFnName: this.#parentTask?.entryFnName(),
				fnName: this.fnName
			});
			if (this.#resolved) throw new Error("subtask has already been resolved");
			if (this.#onProgressFn) this.#onProgressFn();
			if (subtaskValue === null && this.#cancelRequested) if (this.#state === AsyncSubtask.State.STARTING) this.#state = AsyncSubtask.State.CANCELLED_BEFORE_STARTED;
			else {
				if (this.#state !== AsyncSubtask.State.STARTED) throw new Error("resolved subtask must have been started before cancellation");
				this.#state = AsyncSubtask.State.CANCELLED_BEFORE_RETURNED;
			}
			else {
				if (this.#state !== AsyncSubtask.State.STARTED) throw new Error("resolved subtask must have been started before completion");
				this.#state = AsyncSubtask.State.RETURNED;
			}
			this.setResult(subtaskValue);
			for (const f of this.#onResolveHandlers) try {
				f(subtaskValue);
			} catch (err) {
				console.error("error during subtask resolve handler", err);
				throw err;
			}
			const callMetadata = this.getCallMetadata();
			const memory = callMetadata.memory ?? this.#parentTask?.getReturnMemory() ?? lookupMemoriesForComponent({ componentIdx: this.#parentTask?.componentIdx() })[0];
			if (callMetadata && !callMetadata.returnFn && this.isAsync && callMetadata.resultPtr && memory) {
				const { resultPtr, realloc } = callMetadata;
				const lowers = callMetadata.lowers;
				if (lowers && lowers.length > 0) lowers[0]({
					componentIdx: this.#componentIdx,
					memory,
					realloc,
					vals: [subtaskValue],
					storagePtr: resultPtr,
					stringEncoding: callMetadata.stringEncoding
				});
			}
			this.#resolved = true;
			this.#parentTask.removeSubtask(this);
			if (!this.isAsync) {
				this.deliverResolve();
				const rep = this.waitableRep();
				if (rep) try {
					if (this.#getComponentState().handles.remove(rep) !== this) throw new Error("unexpectedly received non-self Subtask from handle removal");
					this.drop();
				} catch (err) {
					_debugLog("[AsyncSubtask#onResolve()] failed to remove subtask after sync subtask completion", err);
				}
			}
		}
		getStateNumber() {
			return this.#state;
		}
		isReturned() {
			return this.#state === AsyncSubtask.State.RETURNED;
		}
		getCallMetadata() {
			return this.#callMetadata;
		}
		isResolved() {
			if (this.#state === AsyncSubtask.State.STARTING || this.#state === AsyncSubtask.State.STARTED) return false;
			if (this.#state === AsyncSubtask.State.RETURNED || this.#state === AsyncSubtask.State.CANCELLED_BEFORE_STARTED || this.#state === AsyncSubtask.State.CANCELLED_BEFORE_RETURNED) return true;
			throw new Error("unrecognized internal Subtask state [" + this.#state + "]");
		}
		addLender(handle) {
			_debugLog("[AsyncSubtask#addLender()] args", { handle });
			if (!Number.isNumber(handle)) throw new Error("missing/invalid lender handle [" + handle + "]");
			if (this.#lenders.length === 0 || this.isResolved()) throw new Error("subtask has no lendors or has already been resolved");
			handle.lends++;
			this.#lenders.push(handle);
		}
		deliverResolve() {
			_debugLog("[AsyncSubtask#deliverResolve()] args", {
				lenders: this.#lenders,
				parentTaskID: this.parentTaskID(),
				subtaskID: this.#id,
				childTaskID: this.childTaskID(),
				resolved: this.isResolved(),
				resolveDelivered: this.resolveDelivered()
			});
			if (this.resolveDelivered() || !this.isResolved()) throw new Error("subtask cannot deliver resolution twice, and the subtask must be resolved");
			for (const lender of this.#lenders) lender.lends--;
			this.#lenders = null;
		}
		resolveDelivered() {
			_debugLog("[AsyncSubtask#resolveDelivered()] args", {});
			if (this.#lenders === null && !this.isResolved()) throw new Error("invalid subtask state, lenders missing and subtask has not been resolved");
			return this.#lenders === null;
		}
		drop() {
			_debugLog("[AsyncSubtask#drop()] args", {
				componentIdx: this.#componentIdx,
				parentTaskID: this.#parentTask?.id(),
				parentTaskFnName: this.#parentTask?.entryFnName(),
				childTaskID: this.#childTask?.id(),
				childTaskFnName: this.#childTask?.entryFnName(),
				subtaskFnName: this.fnName
			});
			if (!this.#waitable) throw new Error("missing/invalid inner waitable");
			if (!this.resolveDelivered()) throw new Error("cannot drop subtask before resolve is delivered");
			if (this.#waitable) this.#waitable.drop();
			this.#dropped = true;
		}
		#getComponentState() {
			const state = getOrCreateAsyncState(this.#componentIdx);
			if (!state) throw new Error("invalid/missing async state for component [" + componentIdx + "]");
			return state;
		}
		getWaitableHandleIdx() {
			_debugLog("[AsyncSubtask#getWaitableHandleIdx()] args", {});
			if (!this.#waitable) throw new Error("missing/invalid waitable");
			return this.waitableRep();
		}
	}
	class Waitable {
		#componentIdx;
		#pendingEventFn = null;
		#promise;
		#resolve;
		#reject;
		#waitableSet = null;
		#hasSyncWaiter = false;
		#idx = null;
		target;
		constructor(args) {
			const { componentIdx, target } = args;
			this.#componentIdx = componentIdx;
			this.target = args.target;
			this.#resetPromise();
		}
		componentIdx() {
			return this.#componentIdx;
		}
		isInSet() {
			return this.#waitableSet !== null;
		}
		idx() {
			return this.#idx;
		}
		setIdx(idx) {
			if (idx === 0) throw new Error("waitable idx cannot be zero");
			this.#idx = idx;
		}
		setTarget(tgt) {
			this.target = tgt;
		}
		#resetPromise() {
			const { promise, resolve, reject } = promiseWithResolvers();
			this.#promise = promise;
			this.#resolve = resolve;
			this.#reject = reject;
		}
		resolve() {
			this.#resolve();
		}
		reject(err) {
			this.#reject(err);
		}
		promise() {
			return this.#promise;
		}
		hasPendingEvent() {
			return this.#pendingEventFn !== null;
		}
		setPendingEvent(fn) {
			_debugLog("[Waitable#setPendingEvent()] args", {
				waitable: this,
				inSet: this.#waitableSet
			});
			this.#pendingEventFn = fn;
		}
		getPendingEvent() {
			_debugLog("[Waitable#getPendingEvent()] args", {
				waitable: this,
				inSet: this.#waitableSet,
				hasPendingEvent: this.#pendingEventFn !== null
			});
			if (this.#pendingEventFn === null) return null;
			const eventFn = this.#pendingEventFn;
			this.#pendingEventFn = null;
			const e = eventFn();
			this.#resetPromise();
			return e;
		}
		join(waitableSet) {
			_debugLog("[Waitable#join()] args", {
				waitable: this,
				waitableSet,
				isRemoval: waitableSet === null
			});
			if (this.#waitableSet === void 0) throw new TypeError("waitable set must be not be undefined");
			if (this.#waitableSet) this.#waitableSet.removeWaitable(this);
			this.#waitableSet = waitableSet;
			if (waitableSet) this.#waitableSet.addWaitable(this);
		}
		drop() {
			_debugLog("[Waitable#drop()] args", {
				componentIdx: this.#componentIdx,
				waitable: this
			});
			if (this.hasPendingEvent()) throw new Error("waitables with pending events cannot be dropped");
			this.join(null);
		}
		async waitForPendingEvent(args) {
			const { cstate } = args;
			if (!cstate) throw new TypeError("missing component state");
			if (this.#waitableSet !== null || this.#hasSyncWaiter) throw new Error("waitable is already in a set/has a sync waiter");
			this.#hasSyncWaiter = true;
			await cstate.waitUntil({
				cancellable: false,
				readyFn: () => this.hasPendingEvent()
			});
			this.#hasSyncWaiter = false;
		}
	}
	const ASYNC_TASKS_BY_COMPONENT_IDX = /* @__PURE__ */ new Map();
	class AsyncTask {
		static _ID = 0n;
		static State = {
			INITIAL: "initial",
			CANCELLED: "cancelled",
			CANCEL_PENDING: "cancel-pending",
			CANCEL_DELIVERED: "cancel-delivered",
			RESOLVED: "resolved"
		};
		static BlockResult = {
			CANCELLED: "block.cancelled",
			NOT_CANCELLED: "block.not-cancelled"
		};
		#id;
		#componentIdx;
		#state;
		#isAsync;
		#isManualAsync;
		#entryFnName = null;
		#onResolveHandlers = [];
		#completionPromise = null;
		#rejected = false;
		#exitPromise = null;
		#onExitHandlers = [];
		#memoryIdx = null;
		#memory = null;
		#callbackFn = null;
		#callbackFnName = null;
		#postReturnFn = null;
		#getCalleeParamsFn = null;
		#stringEncoding = null;
		#parentSubtask = null;
		#errHandling;
		#backpressurePromise;
		#backpressureWaiters = 0n;
		#returnLowerFns = null;
		#subtasks = [];
		#entered = false;
		#exited = false;
		#errored = null;
		cancelled = false;
		cancelRequested = false;
		alwaysTaskReturn = false;
		returnCalls = 0;
		storage = [0, 0];
		borrowedHandles = {};
		tmpRetI64HighBits = 0;
		constructor(opts) {
			this.#id = ++AsyncTask._ID;
			if (opts?.componentIdx === void 0) throw new TypeError("missing component id during task creation");
			this.#componentIdx = opts.componentIdx;
			this.#state = AsyncTask.State.INITIAL;
			this.#isAsync = opts?.isAsync ?? false;
			this.#isManualAsync = opts?.isManualAsync ?? false;
			this.#entryFnName = opts.entryFnName;
			const { promise: completionPromise, resolve: resolveCompletionPromise, reject: rejectCompletionPromise } = promiseWithResolvers();
			this.#completionPromise = completionPromise;
			this.#onResolveHandlers.push((results) => {
				if (this.#parentSubtask !== null) return;
				if (!this.#isAsync) return;
				if (this.#errored !== null) {
					rejectCompletionPromise(this.#errored);
					return;
				} else if (this.#rejected) {
					rejectCompletionPromise(results);
					return;
				}
				resolveCompletionPromise(results);
			});
			const { promise: exitPromise, resolve: resolveExitPromise, reject: rejectExitPromise } = promiseWithResolvers();
			this.#exitPromise = exitPromise;
			this.#onExitHandlers.push(() => {
				resolveExitPromise();
			});
			if (opts.callbackFn) this.#callbackFn = opts.callbackFn;
			if (opts.callbackFnName) this.#callbackFnName = opts.callbackFnName;
			if (opts.getCalleeParamsFn) this.#getCalleeParamsFn = opts.getCalleeParamsFn;
			if (opts.stringEncoding) this.#stringEncoding = opts.stringEncoding;
			if (opts.parentSubtask) this.#parentSubtask = opts.parentSubtask;
			if (opts.errHandling) this.#errHandling = opts.errHandling;
		}
		taskState() {
			return this.#state;
		}
		id() {
			return this.#id;
		}
		componentIdx() {
			return this.#componentIdx;
		}
		entryFnName() {
			return this.#entryFnName;
		}
		completionPromise() {
			return this.#completionPromise;
		}
		exitPromise() {
			return this.#exitPromise;
		}
		isAsync() {
			return this.#isAsync;
		}
		isSync() {
			return !this.isAsync();
		}
		getErrHandling() {
			return this.#errHandling;
		}
		hasCallback() {
			return this.#callbackFn !== null;
		}
		getReturnMemoryIdx() {
			return this.#memoryIdx;
		}
		setReturnMemoryIdx(idx) {
			if (idx === null) return;
			this.#memoryIdx = idx;
		}
		getReturnMemory() {
			return this.#memory;
		}
		setReturnMemory(m) {
			if (m === null) return;
			this.#memory = m;
		}
		setReturnLowerFns(fns) {
			this.#returnLowerFns = fns;
		}
		getReturnLowerFns() {
			return this.#returnLowerFns;
		}
		setParentSubtask(subtask) {
			if (!subtask || !(subtask instanceof AsyncSubtask)) return;
			if (this.#parentSubtask) throw new Error("parent subtask can only be set once");
			this.#parentSubtask = subtask;
		}
		getParentSubtask() {
			return this.#parentSubtask;
		}
		getRootTask() {
			let currentSubtask = this.getParentSubtask();
			let task = this;
			while (currentSubtask) {
				task = currentSubtask.getParentTask();
				currentSubtask = task.getParentSubtask();
			}
			return task;
		}
		setPostReturnFn(f) {
			if (!f) return;
			if (this.#postReturnFn) throw new Error("postReturn fn can only be set once");
			this.#postReturnFn = f;
		}
		setCallbackFn(f, name) {
			if (!f) return;
			if (this.#callbackFn) throw new Error("callback fn can only be set once");
			this.#callbackFn = f;
			this.#callbackFnName = name;
		}
		getCallbackFnName() {
			if (!this.#callbackFnName) return;
			return this.#callbackFnName;
		}
		async runCallbackFn(...args) {
			if (!this.#callbackFn) throw new Error("no callback function has been set for task");
			return _withGlobalCurrentTaskMetaAsync({
				taskID: this.#id,
				componentIdx: this.#componentIdx,
				fn: () => {
					return this.#callbackFn.apply(null, args);
				}
			});
		}
		getCalleeParams() {
			if (!this.#getCalleeParamsFn) throw new Error("missing/invalid getCalleeParamsFn");
			return this.#getCalleeParamsFn();
		}
		mayBlock() {
			return this.isAsync() || this.isResolvedState();
		}
		mayEnter(task) {
			const cstate = getOrCreateAsyncState(this.#componentIdx);
			if (cstate.hasBackpressure()) {
				_debugLog("[AsyncTask#mayEnter()] disallowed due to backpressure", { taskID: this.#id });
				return false;
			}
			if (!cstate.callingSyncImport()) {
				_debugLog("[AsyncTask#mayEnter()] disallowed due to sync import call", { taskID: this.#id });
				return false;
			}
			if (!(cstate.callingSyncExport && !task.isAsync)) {
				_debugLog("[AsyncTask#mayEnter()] disallowed due to sync export w/ sync pending", { taskID: this.#id });
				return false;
			}
			return true;
		}
		enterSync() {
			if (this.needsExclusiveLock()) getOrCreateAsyncState(this.#componentIdx).exclusiveLock();
			return true;
		}
		async enter(opts) {
			_debugLog("[AsyncTask#enter()] args", {
				taskID: this.#id,
				componentIdx: this.#componentIdx,
				subtaskID: this.getParentSubtask()?.id(),
				args: opts,
				entryFnName: this.#entryFnName
			});
			if (this.#entered) throw new Error(`task with ID [${this.#id}] should not be entered twice`);
			const cstate = getOrCreateAsyncState(this.#componentIdx);
			if (opts?.isHost) {
				this.#entered = true;
				return this.#entered;
			}
			await cstate.nextTaskExecutionSlot({ task: this });
			if (this.isSync()) {
				this.#entered = true;
				if (this.#isManualAsync) {
					if (this.needsExclusiveLock()) cstate.exclusiveLock();
				}
				return this.#entered;
			}
			if (cstate.hasBackpressure() || this.needsExclusiveLock() && cstate.isExclusivelyLocked()) {
				cstate.addBackpressureWaiter();
				const result = await this.waitUntil({
					readyFn: () => {
						return !(cstate.hasBackpressure() || this.needsExclusiveLock() && cstate.isExclusivelyLocked());
					},
					cancellable: true
				});
				cstate.removeBackpressureWaiter();
				if (result === AsyncTask.BlockResult.CANCELLED) {
					this.cancel();
					return false;
				}
			}
			try {
				if (this.needsExclusiveLock()) cstate.exclusiveLock();
			} catch {
				while (cstate.hasBackpressure() || this.needsExclusiveLock() && cstate.isExclusivelyLocked()) try {
					if (this.needsExclusiveLock()) cstate.exclusiveLock();
					break;
				} catch (err) {
					cstate.addBackpressureWaiter();
					const result = await this.waitUntil({
						readyFn: () => {
							return !(cstate.hasBackpressure() || this.needsExclusiveLock() && cstate.isExclusivelyLocked());
						},
						cancellable: true
					});
					cstate.removeBackpressureWaiter();
					if (result === AsyncTask.BlockResult.CANCELLED) {
						this.cancel();
						return false;
					}
				}
			}
			this.#entered = true;
			return this.#entered;
		}
		isRunningState() {
			return this.#state !== AsyncTask.State.RESOLVED;
		}
		isResolvedState() {
			return this.#state === AsyncTask.State.RESOLVED;
		}
		isResolved() {
			return this.#state === AsyncTask.State.RESOLVED;
		}
		async waitUntil(opts) {
			const { readyFn, cancellable } = opts;
			_debugLog("[AsyncTask#waitUntil()] args", {
				taskID: this.#id,
				args: { cancellable }
			});
			return await this.suspendUntil({
				readyFn,
				cancellable
			});
		}
		async yieldUntil(opts) {
			const { readyFn, cancellable } = opts;
			_debugLog("[AsyncTask#yieldUntil()]", {
				taskID: this.#id,
				args: { cancellable },
				componentIdx: this.#componentIdx
			});
			if (await this.suspendUntil({
				readyFn,
				cancellable
			})) return {
				code: ASYNC_EVENT_CODE.NONE,
				payload0: 0,
				payload1: 0
			};
			return {
				code: ASYNC_EVENT_CODE.TASK_CANCELLED,
				payload0: 0,
				payload1: 0
			};
		}
		async suspendUntil(opts) {
			const { cancellable, readyFn } = opts;
			_debugLog("[AsyncTask#suspendUntil()] args", {
				taskID: this.#id,
				args: { cancellable },
				componentIdx: this.#componentIdx
			});
			if (this.deliverPendingCancel({ cancellable })) return false;
			return await this.immediateSuspendUntil({
				readyFn,
				cancellable
			});
		}
		async immediateSuspendUntil(opts) {
			const { cancellable, readyFn } = opts;
			_debugLog("[AsyncTask#immediateSuspendUntil()] args", {
				args: {
					cancellable,
					readyFn
				},
				taskID: this.#id,
				componentIdx: this.#componentIdx
			});
			if (readyFn() && ASYNC_DETERMINISM === "random") {
				if (_coinFlip()) return true;
			}
			return await this.immediateSuspend({
				cancellable,
				readyFn
			});
		}
		async immediateSuspend(opts) {
			const { cancellable, readyFn } = opts;
			_debugLog("[AsyncTask#immediateSuspend()] args", {
				cancellable,
				readyFn
			});
			if (this.deliverPendingCancel({ cancellable })) return false;
			return await getOrCreateAsyncState(this.#componentIdx).suspendTask({
				task: this,
				readyFn
			});
		}
		deliverPendingCancel(opts) {
			const { cancellable } = opts;
			_debugLog("[AsyncTask#deliverPendingCancel()]", {
				args: { cancellable },
				taskID: this.#id,
				componentIdx: this.#componentIdx
			});
			if (cancellable && this.#state === AsyncTask.State.PENDING_CANCEL) {
				this.#state = AsyncTask.State.CANCEL_DELIVERED;
				return true;
			}
			return false;
		}
		isCancelled() {
			return this.cancelled;
		}
		cancel(args) {
			_debugLog("[AsyncTask#cancel()] args", {});
			if (this.taskState() !== AsyncTask.State.CANCEL_DELIVERED) throw new Error(`(component [${this.#componentIdx}]) task [${this.#id}] invalid task state [${this.taskState()}] for cancellation`);
			if (this.borrowedHandles.length > 0) throw new Error("task still has borrow handles");
			this.cancelled = true;
			this.onResolve(args?.error ?? /* @__PURE__ */ new Error("task cancelled"));
			this.#state = AsyncTask.State.RESOLVED;
		}
		onResolve(taskValue) {
			const handlers = this.#onResolveHandlers;
			this.#onResolveHandlers = [];
			for (const f of handlers) try {
				f(taskValue);
			} catch (err) {
				_debugLog("[AsyncTask#onResolve] error during task resolve handler", err);
				throw err;
			}
			if (this.#parentSubtask) {
				const meta = this.#parentSubtask.getCallMetadata();
				if (meta.returnFn && !meta.returnFnCalled) {
					_debugLog("[AsyncTask#onResolve()] running returnFn", {
						componentIdx: this.#componentIdx,
						taskID: this.#id,
						subtaskID: this.#parentSubtask.id()
					});
					meta.getMemoryFn();
					meta.returnFn.apply(null, [taskValue, meta.resultPtr]);
					meta.returnFnCalled = true;
				}
			}
			if (this.#postReturnFn) {
				_debugLog("[AsyncTask#onResolve()] running post return ", {
					componentIdx: this.#componentIdx,
					taskID: this.#id
				});
				try {
					this.#postReturnFn(taskValue);
				} catch (err) {
					_debugLog("[AsyncTask#onResolve] error during task resolve handler", err);
					throw err;
				}
			}
			if (this.#parentSubtask) this.#parentSubtask.onResolve(taskValue);
		}
		registerOnResolveHandler(f) {
			this.#onResolveHandlers.push(f);
		}
		isRejected() {
			return this.#rejected;
		}
		isErrored() {
			return this.#errored;
		}
		setErrored(err) {
			this.#errored = err;
		}
		reject(taskErr) {
			_debugLog("[AsyncTask#reject()] args", {
				componentIdx: this.#componentIdx,
				taskID: this.#id,
				parentSubtask: this.#parentSubtask,
				parentSubtaskID: this.#parentSubtask?.id(),
				entryFnName: this.entryFnName(),
				callbackFnName: this.#callbackFnName,
				errMsg: taskErr.message
			});
			if (this.isResolvedState() || this.#rejected) return;
			this.#rejected = true;
			this.cancelRequested = true;
			this.#state = AsyncTask.State.PENDING_CANCEL;
			this.deliverPendingCancel({ cancellable: true });
			this.cancel({ error: taskErr });
		}
		resolve(results) {
			_debugLog("[AsyncTask#resolve()] args", {
				componentIdx: this.#componentIdx,
				taskID: this.#id,
				entryFnName: this.entryFnName(),
				callbackFnName: this.#callbackFnName
			});
			if (this.#state === AsyncTask.State.RESOLVED) throw new Error(`(component [${this.#componentIdx}]) task [${this.#id}]  is already resolved (did you forget to wait for an import?)`);
			if (this.borrowedHandles.length > 0) throw new Error("task still has borrow handles");
			this.#state = AsyncTask.State.RESOLVED;
			switch (results.length) {
				case 0:
					this.onResolve(void 0);
					break;
				case 1:
					this.onResolve(results[0]);
					break;
				default:
					_debugLog("[AsyncTask#resolve()] unexpected number of results", {
						componentIdx: this.#componentIdx,
						results,
						taskID: this.#id,
						subtaskID: this.#parentSubtask?.id(),
						entryFnName: this.#entryFnName,
						callbackFnName: this.#callbackFnName
					});
					throw new Error("unexpected number of results");
			}
		}
		exit(args) {
			_debugLog("[AsyncTask#exit()]", {
				componentIdx: this.#componentIdx,
				taskID: this.#id
			});
			if (this.#exited) throw new Error("task has already exited");
			if (this.#state !== AsyncTask.State.RESOLVED) throw new Error(`(component [${this.#componentIdx}]) task [${this.#id}] exited without resolution`);
			if (this.borrowedHandles > 0) throw new Error("task [${this.#id}] exited without clearing borrowed handles");
			const state = getOrCreateAsyncState(this.#componentIdx);
			if (!state) throw new Error("missing async state for component [" + this.#componentIdx + "]");
			if (this.#componentIdx !== -1 && !args?.skipExclusiveLockCheck) {
				if (this.needsExclusiveLock() && !state.isExclusivelyLocked()) throw new Error(`task [${this.#id}] exit: component [${this.#componentIdx}] should have been exclusively locked`);
			}
			state.exclusiveRelease();
			for (const f of this.#onExitHandlers) try {
				f();
			} catch (err) {
				console.error("error during task exit handler", err);
				throw err;
			}
			this.#exited = true;
			clearCurrentTask(this.#componentIdx, this.id());
		}
		needsExclusiveLock() {
			return !this.#isAsync || this.hasCallback();
		}
		createSubtask(args) {
			_debugLog("[AsyncTask#createSubtask()] args", args);
			const { componentIdx, childTask, callMetadata, fnName, isAsync, isManualAsync } = args;
			const cstate = getOrCreateAsyncState(this.#componentIdx);
			if (!cstate) throw new Error(`invalid/missing async state for component idx [${componentIdx}]`);
			const waitable = new Waitable({
				componentIdx: this.#componentIdx,
				target: `subtask (internal ID [${this.#id}])`
			});
			const newSubtask = new AsyncSubtask({
				componentIdx,
				childTask,
				parentTask: this,
				callMetadata,
				isAsync,
				isManualAsync,
				fnName,
				waitable
			});
			this.#subtasks.push(newSubtask);
			newSubtask.setTarget(`subtask (internal ID [${newSubtask.id()}], waitable [${waitable.idx()}], component [${componentIdx}])`);
			waitable.setIdx(cstate.handles.insert(newSubtask));
			waitable.setTarget(`waitable for subtask (waitable id [${waitable.idx()}], subtask internal ID [${newSubtask.id()}])`);
			return newSubtask;
		}
		getLatestSubtask() {
			return this.#subtasks.at(-1);
		}
		getSubtaskByWaitableRep(rep) {
			if (rep === void 0) throw new TypeError("missing rep");
			return this.#subtasks.find((s) => s.waitableRep() === rep);
		}
		currentSubtask() {
			_debugLog("[AsyncTask#currentSubtask()]");
			if (this.#subtasks.length === 0) return;
			return this.#subtasks.at(-1);
		}
		removeSubtask(subtask) {
			if (this.#subtasks.length === 0) throw new Error("cannot end current subtask: no current subtask");
			this.#subtasks = this.#subtasks.filter((t) => t !== subtask);
			return subtask;
		}
	}
	const ASYNC_EVENT_CODE = {
		NONE: 0,
		SUBTASK: 1,
		STREAM_READ: 2,
		STREAM_WRITE: 3,
		FUTURE_READ: 4,
		FUTURE_WRITE: 5,
		TASK_CANCELLED: 6
	};
	function getCurrentTask(componentIdx, taskID) {
		if (componentIdx === void 0 || componentIdx === null) throw new Error("missing component idx");
		const taskMetas = ASYNC_TASKS_BY_COMPONENT_IDX.get(componentIdx);
		if (taskMetas === void 0 || taskMetas.length === 0) return;
		if (taskID) return taskMetas.find((meta) => meta.task.id() === taskID);
		const taskMeta = taskMetas[taskMetas.length - 1];
		if (!taskMeta || !taskMeta.task) return;
		return taskMeta;
	}
	const emptyFunc = () => {};
	let dv = /* @__PURE__ */ new DataView(/* @__PURE__ */ new ArrayBuffer());
	const dataView = (mem) => dv.buffer === mem.buffer ? dv : dv = new DataView(mem.buffer);
	function toUint32(val) {
		return val >>> 0;
	}
	function toUint8(val) {
		val >>>= 0;
		val %= 2 ** 8;
		return val;
	}
	const utf16Decoder = new TextDecoder("utf-16");
	const TEXT_DECODER_UTF8 = new TextDecoder();
	const TEXT_ENCODER_UTF8 = new TextEncoder();
	function _utf8AllocateAndEncode(s, realloc, memory) {
		if (typeof s !== "string") throw new TypeError("expected a string, received [" + typeof s + "]");
		if (s.length === 0) return {
			ptr: 1,
			len: 0
		};
		let buf = TEXT_ENCODER_UTF8.encode(s);
		let ptr = realloc(0, 0, 1, buf.length);
		new Uint8Array(memory.buffer).set(buf, ptr);
		return {
			ptr,
			len: buf.length,
			codepoints: [...s].length
		};
	}
	const T_FLAG = 1 << 30;
	function rscTableCreateOwn(table, rep) {
		const free = table[0] & ~T_FLAG;
		table._createdReps.add(rep);
		if (free === 0) {
			table.push(0);
			table.push(rep | T_FLAG);
			return (table.length >> 1) - 1;
		}
		table[0] = table[free << 1];
		table[free << 1] = 0;
		table[(free << 1) + 1] = rep | T_FLAG;
		return free;
	}
	function rscTableRemove(table, handle) {
		const scope = table[handle << 1];
		const val = table[(handle << 1) + 1];
		const own = (val & T_FLAG) !== 0;
		const rep = val & ~T_FLAG;
		if (val === 0 || (scope & T_FLAG) !== 0) throw new TypeError("Invalid handle");
		table[handle << 1] = table[0] | T_FLAG;
		table[0] = handle | T_FLAG;
		return {
			rep,
			scope,
			own
		};
	}
	function createNewCurrentTask(args) {
		_debugLog("[createNewCurrentTask()] args", args);
		const { componentIdx, isAsync, isManualAsync, entryFnName, parentSubtaskID, callbackFnName, getCallbackFn, getParamsFn, stringEncoding, errHandling, getCalleeParamsFn, resultPtr, callingWasmExport } = args;
		if (componentIdx === void 0 || componentIdx === null) throw new Error("missing/invalid component instance index while starting task");
		let taskMetas = ASYNC_TASKS_BY_COMPONENT_IDX.get(componentIdx);
		const newTask = new AsyncTask({
			componentIdx,
			isAsync,
			isManualAsync,
			entryFnName,
			callbackFn: getCallbackFn ? getCallbackFn() : null,
			callbackFnName,
			stringEncoding,
			getCalleeParamsFn,
			resultPtr,
			errHandling
		});
		const newTaskID = newTask.id();
		const newTaskMeta = {
			id: newTaskID,
			componentIdx,
			task: newTask
		};
		ASYNC_CURRENT_TASK_IDS.push(newTaskID);
		ASYNC_CURRENT_COMPONENT_IDXS.push(componentIdx);
		if (!taskMetas) {
			taskMetas = [newTaskMeta];
			ASYNC_TASKS_BY_COMPONENT_IDX.set(componentIdx, [newTaskMeta]);
		} else taskMetas.push(newTaskMeta);
		return [newTask, newTaskID];
	}
	function _lowerImportBackwardsCompat(args) {
		const params = [...arguments].slice(1);
		_debugLog("[_lowerImportBackwardsCompat()] args", {
			args,
			params
		});
		const { functionIdx, componentIdx, isAsync, isManualAsync, paramLiftFns, resultLowerFns, hasResultPointer, funcTypeIsAsync, metadata, memoryIdx, getMemoryFn, getReallocFn, importFn, stringEncoding } = args;
		let meta = _getGlobalCurrentTaskMeta(componentIdx);
		let createdTask;
		if (!meta) {
			if (funcTypeIsAsync || isAsync && !isManualAsync) throw new Error("p3 async wasm exports cannot use backwards compat auto-task init");
			const [newTask, newTaskID] = createNewCurrentTask({
				componentIdx,
				isAsync,
				isManualAsync,
				callingWasmExport: false
			});
			createdTask = newTask;
			createdTask.registerOnResolveHandler(() => {
				_clearCurrentTask({
					taskID: task.id(),
					componentIdx: task.componentIdx()
				});
			});
			_setGlobalCurrentTaskMeta({
				componentIdx,
				taskID: newTaskID
			});
			meta = _getGlobalCurrentTaskMeta(componentIdx);
		}
		const { taskID } = meta;
		const taskMeta = getCurrentTask(componentIdx, taskID);
		if (!taskMeta) throw new Error("invalid/missing async task meta");
		const task = taskMeta.task;
		if (!task) throw new Error("invalid/missing async task");
		getOrCreateAsyncState(componentIdx);
		if (!task.mayBlock() && funcTypeIsAsync && !isAsync) throw new Error("non async exports cannot synchronously call async functions");
		const memory = getMemoryFn();
		const resultPtr = hasResultPointer ? params[params.length - 1] : void 0;
		const subtask = task.createSubtask({
			componentIdx,
			parentTask: task,
			fnName: importFn.fnName,
			isAsync,
			isManualAsync,
			callMetadata: {
				memoryIdx,
				memory,
				realloc: getReallocFn?.(),
				getReallocFn,
				resultPtr,
				lowers: resultLowerFns,
				stringEncoding
			}
		});
		task.setReturnMemoryIdx(memoryIdx);
		task.setReturnMemory(getMemoryFn());
		subtask.onStart();
		if (!isManualAsync && !isAsync && !funcTypeIsAsync) {
			if (createdTask) createdTask.enterSync();
			importFn(...params);
			if (!funcTypeIsAsync && !subtask.isReturned()) throw new Error("post-execution subtasks must either be async or returned");
			const syncRes = subtask.getResult();
			if (createdTask) createdTask.resolve([syncRes]);
			return syncRes;
		}
		if (!isManualAsync && !isAsync && funcTypeIsAsync) {
			const { promise, resolve } = new Promise();
			queueMicrotask(async () => {
				if (!subtask.isResolvedState()) await task.suspendUntil({ readyFn: () => task.isResolvedState() });
				resolve(subtask.getResult());
			});
			return promise;
		}
		const subtaskState = subtask.getStateNumber();
		if (subtaskState < 0 || subtaskState >= 2 ** 4) throw new Error("invalid subtask state, out of valid range");
		subtask.setOnProgressFn(() => {
			subtask.setPendingEvent(() => {
				if (subtask.isResolved()) subtask.deliverResolve();
				return {
					code: ASYNC_EVENT_CODE.SUBTASK,
					payload0: subtask.waitableRep(),
					payload1: subtask.getStateNumber()
				};
			});
		});
		const requiresManualAsyncResult = !isAsync && !funcTypeIsAsync && isManualAsync;
		let manualAsyncResult;
		if (requiresManualAsyncResult) manualAsyncResult = promiseWithResolvers();
		queueMicrotask(async () => {
			try {
				_debugLog("[_lowerImportBackwardsCompat()] calling lowered import", {
					importFn,
					params
				});
				if (createdTask) await createdTask.enter();
				const asyncRes = await importFn(...params);
				if (requiresManualAsyncResult) manualAsyncResult.resolve(subtask.getResult());
				if (createdTask) createdTask.resolve([asyncRes]);
			} catch (err) {
				_debugLog("[_lowerImportBackwardsCompat()] import fn error:", err);
				if (requiresManualAsyncResult) manualAsyncResult.reject(err);
				throw err;
			}
		});
		if (requiresManualAsyncResult) return manualAsyncResult.promise;
		return Number(subtask.waitableRep()) << 4 | subtaskState;
	}
	function _liftFlatU8(ctx) {
		_debugLog("[_liftFlatU8()] args", { ctx });
		let val;
		if (ctx.useDirectParams) {
			if (ctx.params.length === 0) throw new Error("expected at least a single i32 argument");
			val = ctx.params[0];
			ctx.params = ctx.params.slice(1);
			return [val, ctx];
		}
		if (ctx.storageLen !== void 0 && ctx.storageLen < 1) throw new Error(`insufficient storage ([${ctx.storageLen}] bytes) for lift (u8 requires 1 byte)`);
		val = new DataView(ctx.memory.buffer).getUint8(ctx.storagePtr, true);
		ctx.storagePtr += 1;
		if (ctx.storageLen !== void 0) ctx.storageLen -= 1;
		return [val, ctx];
	}
	function _liftFlatU16(ctx) {
		_debugLog("[_liftFlatU16()] args", { ctx });
		let val;
		if (ctx.useDirectParams) {
			if (ctx.params.length === 0) throw new Error("expected at least a single i32 argument");
			val = ctx.params[0];
			ctx.params = ctx.params.slice(1);
			return [val, ctx];
		}
		if (ctx.storageLen !== void 0 && ctx.storageLen < 2) throw new Error(`insufficient storage ([${ctx.storageLen}] bytes) for lift (u16 requires 2 bytes)`);
		val = new DataView(ctx.memory.buffer).getUint16(ctx.storagePtr, true);
		ctx.storagePtr += 2;
		if (ctx.storageLen !== void 0) ctx.storageLen -= 2;
		const rem = ctx.storagePtr % 2;
		if (rem !== 0) ctx.storagePtr += 2 - rem;
		return [val, ctx];
	}
	function _liftFlatU32(ctx) {
		_debugLog("[_liftFlatU32()] args", { ctx });
		let val;
		if (ctx.useDirectParams) {
			if (ctx.params.length === 0) throw new Error("expected at least a single i34 argument");
			val = ctx.params[0];
			ctx.params = ctx.params.slice(1);
			return [val, ctx];
		}
		if (ctx.storageLen !== void 0 && ctx.storageLen < 4) throw new Error(`insufficient storage ([${ctx.storageLen}] bytes) for lift (u32 requires 4 bytes)`);
		val = new DataView(ctx.memory.buffer).getUint32(ctx.storagePtr, true);
		ctx.storagePtr += 4;
		if (ctx.storageLen !== void 0) ctx.storageLen -= 4;
		return [val, ctx];
	}
	function _liftFlatS64(ctx) {
		_debugLog("[_liftFlatS64()] args", { ctx });
		let val;
		if (ctx.useDirectParams) {
			if (ctx.params.length === 0) throw new Error("expected at least one single i64 argument");
			if (typeof ctx.params[0] !== "bigint") throw new Error("expected bigint");
			val = ctx.params[0];
			ctx.params = ctx.params.slice(1);
			return [val, ctx];
		}
		if (ctx.storageLen !== void 0 && ctx.storageLen < 8) throw new Error(`insufficient storage ([${ctx.storageLen}] bytes) for lift (s64 requires 8 bytes)`);
		val = new DataView(ctx.memory.buffer).getBigInt64(ctx.storagePtr, true);
		ctx.storagePtr += 8;
		if (ctx.storageLen !== void 0) ctx.storageLen -= 8;
		return [val, ctx];
	}
	function _liftFlatFloat64(ctx) {
		_debugLog("[_liftFlatFloat64()] args", { ctx });
		let val;
		if (ctx.useDirectParams) {
			if (ctx.params.length === 0) throw new Error("expected at least one single f64 argument");
			val = ctx.params[0];
			ctx.params = ctx.params.slice(1);
			if (ctx.inVariant) {
				const dv = /* @__PURE__ */ new DataView(/* @__PURE__ */ new ArrayBuffer(8));
				dv.setBigInt64(0, val);
				val = dv.getFloat64(0);
			}
			return [val, ctx];
		}
		if (ctx.storageLen !== void 0 && ctx.storageLen < 8) throw new Error(`insufficient storage ([${ctx.storageLen}] bytes) for lift (f64 requires 8 bytes)`);
		val = new DataView(ctx.memory.buffer).getFloat64(ctx.storagePtr, true);
		ctx.storagePtr += 8;
		if (ctx.storageLen !== void 0) ctx.storageLen -= 8;
		return [val, ctx];
	}
	function _liftFlatStringAny(ctx) {
		switch (ctx.stringEncoding) {
			case "utf8": return _liftFlatStringUTF8(ctx);
			case "utf16": return _liftFlatStringUTF16(ctx);
			default: throw new Error(`missing/unrecognized/unsupported string encoding [${ctx.stringEncoding}]`);
		}
	}
	function _liftFlatStringUTF8(ctx) {
		_debugLog("[_liftFlatStringUTF8()] args", { ctx });
		let val;
		if (ctx.useDirectParams) {
			if (ctx.params.length < 2) throw new Error("expected at least two u32 arguments");
			let offset = ctx.params[0];
			if (typeof offset === "bigint") offset = Number(offset);
			if (!Number.isSafeInteger(offset)) throw new Error("invalid offset");
			const len = ctx.params[1];
			if (!Number.isSafeInteger(len)) throw new Error("invalid len");
			val = TEXT_DECODER_UTF8.decode(new DataView(ctx.memory.buffer, offset, len));
			ctx.params = ctx.params.slice(2);
			return [val, ctx];
		}
		const rem = ctx.storagePtr % 4;
		if (rem !== 0) ctx.storagePtr += 4 - rem;
		const dv = new DataView(ctx.memory.buffer);
		const start = dv.getUint32(ctx.storagePtr, true);
		const codeUnits = dv.getUint32(ctx.storagePtr + 4, true);
		val = TEXT_DECODER_UTF8.decode(new Uint8Array(ctx.memory.buffer, start, codeUnits));
		ctx.storagePtr += 8;
		if (ctx.storageLen !== void 0) ctx.storagelen -= 8;
		return [val, ctx];
	}
	function _liftFlatStringUTF16(ctx) {
		_debugLog("[_liftFlatStringUTF16()] args", { ctx });
		let val;
		if (ctx.useDirectParams) {
			if (ctx.params.length < 2) throw new Error("expected at least two u32 arguments");
			let offset = ctx.params[0];
			if (typeof offset === "bigint") offset = Number(offset);
			if (!Number.isSafeInteger(offset)) throw new Error("invalid offset");
			const len = ctx.params[1];
			if (!Number.isSafeInteger(len)) throw new Error("invalid len");
			val = utf16Decoder.decode(new DataView(ctx.memory.buffer, offset, len));
			ctx.params = ctx.params.slice(2);
			return [val, ctx];
		}
		const data = new DataView(ctx.memory.buffer);
		const start = data.getUint32(ctx.storagePtr, vals[0], true);
		const codeUnits = data.getUint32(ctx.storagePtr, vals[0] + 4, true);
		val = utf16Decoder.decode(new Uint16Array(ctx.memory.buffer, start, codeUnits));
		ctx.storagePtr = ctx.storagePtr + 2 * codeUnits;
		if (ctx.storageLen !== void 0) ctx.storageLen = ctx.storageLen - 2 * codeUnits;
		return [val, ctx];
	}
	function _liftFlatRecord(meta) {
		const { fieldMetas, size32: recordSize32, align32: recordAlign32 } = meta;
		return function _liftFlatRecordInner(ctx) {
			_debugLog("[_liftFlatRecord()] args", { ctx });
			const originalPtr = ctx.storagePtr;
			const res = {};
			for (const [key, liftFn, size32, align32] of fieldMetas) {
				let fieldPtr;
				if (ctx.storagePtr !== void 0) {
					const rem = ctx.storagePtr % align32;
					if (rem !== 0) ctx.storagePtr += align32 - rem;
					fieldPtr = ctx.storagePtr;
				}
				let fieldLen;
				if (ctx.storageLen !== void 0) fieldLen = ctx.storageLen;
				let [val, newCtx] = liftFn(ctx);
				res[key] = val;
				ctx = newCtx;
				if (fieldPtr !== void 0) ctx.storagePtr = Math.max(ctx.storagePtr, fieldPtr + size32);
				if (fieldLen !== void 0) ctx.storageLen = fieldLen - size32;
			}
			if (originalPtr !== void 0) ctx.storagePtr = Math.max(ctx.storagePtr, originalPtr + recordSize32);
			if (ctx.storagePtr !== void 0) {
				const rem = ctx.storagePtr % recordAlign32;
				if (rem !== 0) ctx.storagePtr += recordAlign32 - rem;
			}
			return [res, ctx];
		};
	}
	function _liftFlatVariant(meta) {
		const { caseMetas, variantSize32, variantAlign32, variantPayloadOffset32, variantFlatCount, isEnum } = meta;
		return function _liftFlatVariantInner(ctx) {
			_debugLog("[_liftFlatVariant()] args", { ctx });
			const origUseParams = ctx.useDirectParams;
			const wasInVariant = ctx.inVariant;
			ctx.inVariant = true;
			let caseIdx;
			let liftRes;
			const originalPtr = ctx.storagePtr;
			const numCases = caseMetas.length;
			if (caseMetas.length < 256) liftRes = _liftFlatU8(ctx);
			else if (numCases >= 256 && numCases < 65536) liftRes = _liftFlatU16(ctx);
			else if (numCases >= 65536 && numCases < 4294967296) liftRes = _liftFlatU32(ctx);
			else throw new Error(`unsupported number of variant cases [${numCases}]`);
			caseIdx = liftRes[0];
			ctx = liftRes[1];
			const [tag, liftFn, caseSize32, caseAlign32, caseFlatCount] = caseMetas[caseIdx];
			if (variantPayloadOffset32 === void 0) throw new Error("unexpectedly missing payload offset");
			if (originalPtr !== void 0) ctx.storagePtr = originalPtr + variantPayloadOffset32;
			let val;
			if (liftFn === null) {
				val = { tag };
				if (originalPtr !== void 0) ctx.storagePtr = originalPtr + variantSize32;
			} else {
				if (ctx.useDirectParams && ctx.params && liftFn !== _liftFlatFloat64 && typeof ctx.params[0] === "bigint") {
					if (ctx.params[0] > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`invalid value, reinterpreted i32/f32 too large: [${ctx.params[0]}]`);
					ctx.params[0] = Number(ctx.params[0]);
				}
				const [newVal, newCtx] = liftFn(ctx);
				val = {
					tag,
					val: newVal
				};
				ctx = newCtx;
			}
			if (origUseParams) {
				if (variantFlatCount === void 0 || variantFlatCount === null) {
					_debugLog("[_liftFlatVariant()] variant with unknown flat count", {
						ctx,
						meta
					});
					throw new Error("cannot lift variant with unknown flat count");
				}
				if (caseFlatCount === void 0 || caseFlatCount === null) {
					_debugLog("[_liftFlatVariant()] case with unknown flat count", {
						ctx,
						meta,
						case: meta.caseMetas[caseIdx]
					});
					throw new Error("cannot lift case with unknown flat count");
				}
				const remainingPayloadParams = variantFlatCount - caseFlatCount - (isEnum ? 0 : 1);
				if (remainingPayloadParams < 0) throw new Error(`invalid variant flat count metadata`);
				if (ctx.params.length < remainingPayloadParams) throw new Error(`expected at least [${remainingPayloadParams}] remaining variant payload params, but got [${ctx.params.length}]`);
				ctx.params = ctx.params.slice(remainingPayloadParams);
			}
			if (ctx.storagePtr !== void 0) {
				const rem = ctx.storagePtr % variantAlign32;
				if (rem !== 0) ctx.storagePtr += variantAlign32 - rem;
			}
			ctx.inVariant = wasInVariant;
			return [val, ctx];
		};
	}
	function _liftFlatEnum(meta) {
		meta.isEnum = true;
		const f = _liftFlatVariant(meta);
		return function _liftFlatEnumInner(ctx) {
			_debugLog("[_liftFlatEnum()] args", { ctx });
			const res = f(ctx);
			res[0] = res[0].tag;
			return res;
		};
	}
	function _liftFlatOption(meta) {
		const f = _liftFlatVariant(meta);
		return function _liftFlatOptionInner(ctx) {
			_debugLog("[_liftFlatOption()] args", { ctx });
			return f(ctx);
		};
	}
	function _lowerFlatU8(ctx) {
		_debugLog("[_lowerFlatU8()] args", ctx);
		if (ctx.vals.length !== 1) throw new Error(`unexpected number [${ctx.vals.length}] of vals (expected 1)`);
		_requireValidNumericPrimitive.bind("u8", ctx.vals[0]);
		if (!ctx.memory) throw new Error("missing memory for lower");
		new DataView(ctx.memory.buffer).setUint32(ctx.storagePtr, ctx.vals[0], true);
		ctx.storagePtr += 1;
	}
	function _lowerFlatU16(ctx) {
		_debugLog("[_lowerFlatU16()] args", { ctx });
		if (!ctx.memory) throw new Error("missing memory for lower");
		if (ctx.vals.length !== 1) throw new Error(`unexpected number [${ctx.vals.length}] of vals (expected 1)`);
		const rem = ctx.storagePtr % 2;
		if (rem !== 0) ctx.storagePtr += 2 - rem;
		_requireValidNumericPrimitive.bind("u16", ctx.vals[0]);
		new DataView(ctx.memory.buffer).setUint16(ctx.storagePtr, ctx.vals[0], true);
		ctx.storagePtr += 2;
	}
	function _lowerFlatU32(ctx) {
		_debugLog("[_lowerFlatU32()] args", { ctx });
		if (ctx.vals.length !== 1) throw new Error(`expected single value to lower, got [${ctx.vals.length}]`);
		const rem = ctx.storagePtr % 4;
		if (rem !== 0) ctx.storagePtr += 4 - rem;
		_requireValidNumericPrimitive.bind("u32", ctx.vals[0]);
		new DataView(ctx.memory.buffer).setUint32(ctx.storagePtr, ctx.vals[0], true);
		ctx.storagePtr += 4;
	}
	function _lowerFlatStringAny(ctx) {
		switch (ctx.stringEncoding) {
			case "utf8": return _lowerFlatStringUTF8(ctx);
			case "utf16": return _lowerFlatStringUTF16(ctx);
			default: throw new Error(`missing/unrecognized/unsupported string encoding [${ctx.stringEncoding}]`);
		}
	}
	function _lowerFlatStringUTF8(ctx) {
		_debugLog("[_lowerFlatStringUTF8()] args", ctx);
		if (!ctx.realloc) throw new Error("missing realloc during flat string lower");
		ctx.vals[0];
		const { ptr, codepoints } = _utf8AllocateAndEncode(ctx.vals[0], ctx.realloc, ctx.memory);
		const view = new DataView(ctx.memory.buffer);
		view.setUint32(ctx.storagePtr, ptr, true);
		view.setUint32(ctx.storagePtr + 4, codepoints, true);
		ctx.storagePtr += 8;
	}
	function _lowerFlatStringUTF16(ctx) {
		_debugLog("[_lowerFlatStringUTF16()] args", { ctx });
		if (!ctx.realloc) throw new Error("missing realloc during flat string lower");
		ctx.vals[0];
		const { ptr, len, codepoints } = _utf16AllocateAndEncode(ctx.vals[0], ctx.realloc, ctx.memory);
		const view = new DataView(ctx.memory.buffer);
		view.setUint32(ctx.storagePtr, ptr, true);
		view.setUint32(ctx.storagePtr + 4, codepoints, true);
		const bytes = new Uint16Array(ctx.memory.buffer, start, codeUnits);
		if (ctx.memory.buffer.byteLength < start + bytes.byteLength) throw new Error("memory out of bounds");
		if (ctx.storageLen !== void 0 && ctx.storageLen !== bytes.byteLength) throw new Error(`storage length [${ctx.storageLen}] != [${bytes.byteLength}])`);
		new Uint16Array(ctx.memory.buffer, ctx.storagePtr).set(bytes);
		ctx.storagePtr += len;
	}
	function _lowerFlatRecord(meta) {
		const { fieldMetas, size32: recordSize32, align32: recordAlign32 } = meta;
		return function _lowerFlatRecordInner(ctx) {
			_debugLog("[_lowerFlatRecord()] args", { ctx });
			const originalPtr = ctx.storagePtr;
			const r = ctx.vals[0];
			for (const [tag, lowerFn, size32, align32] of fieldMetas) {
				const rem = ctx.storagePtr % align32;
				if (rem !== 0) ctx.storagePtr += align32 - rem;
				const fieldPtr = ctx.storagePtr;
				ctx.vals = [r[tag]];
				lowerFn(ctx);
				ctx.storagePtr = Math.max(ctx.storagePtr, fieldPtr + size32);
			}
			ctx.storagePtr = Math.max(ctx.storagePtr, originalPtr + recordSize32);
			const rem = ctx.storagePtr % recordAlign32;
			if (rem !== 0) ctx.storagePtr += recordAlign32 - rem;
		};
	}
	function _lowerFlatVariant(meta) {
		const { variantSize32, variantAlign32, variantPayloadOffset32, caseMetas } = meta;
		let caseLookup = {};
		for (const [idx, meta] of caseMetas.entries()) {
			let tag = meta[0];
			caseLookup[tag] = {
				discriminant: idx,
				meta
			};
		}
		return function _lowerFlatVariantInner(ctx) {
			_debugLog("[_lowerFlatVariant()] args", { ctx });
			const { tag, val } = ctx.vals[0];
			const variantCase = caseLookup[tag];
			if (!variantCase) throw new Error(`missing tag [${tag}] (valid tags: ${Object.keys(caseLookup)})`);
			const [_tag, lowerFn, caseSize32, caseAlign32, caseFlatCount] = variantCase.meta;
			const originalPtr = ctx.storagePtr;
			ctx.vals = [variantCase.discriminant];
			if (caseMetas.length < 256) _lowerFlatU8(ctx);
			else if (caseMetas.length >= 256 && caseMetas.length < 65536) _lowerFlatU16(ctx);
			else if (caseMetas.length >= 65536 && caseMetas.length < 4294967296) _lowerFlatU32(ctx);
			else throw new Error(`unsupported number of cases [${caseMetas.length}]`);
			ctx.storagePtr = originalPtr + variantPayloadOffset32;
			ctx.vals = [val];
			if (lowerFn) lowerFn(ctx);
			ctx.storagePtr = Math.max(ctx.storagePtr, originalPtr + variantSize32);
			const rem = ctx.storagePtr % variantAlign32;
			if (rem !== 0) ctx.storagePtr += varianttAlign32 - rem;
		};
	}
	function _lowerFlatList(meta) {
		const { elemLowerFn, knownLen, size32, align32, elemSize32, elemAlign32 } = meta;
		if (!elemLowerFn) throw new TypeError("missing/invalid element lower fn for list");
		return function _lowerFlatListInner(ctx) {
			_debugLog("[_lowerFlatList()] args", { ctx });
			if (ctx.useDirectParams) {
				if (ctx.params.length < 2) throw new Error("insufficient params left to lower list");
				const storagePtr = ctx.params[0];
				ctx.params[1];
				ctx.params = ctx.params.slice(2);
				const list = ctx.vals[0];
				if (!list) throw new Error("missing direct param value");
				const lowerCtx = {
					storagePtr,
					memory: ctx.memory,
					stringEncoding: ctx.stringEncoding
				};
				for (let idx = 0; idx < list.length; idx++) {
					const elemPtr = storagePtr + idx * elemSize32;
					lowerCtx.storagePtr = elemPtr;
					lowerCtx.vals = list.slice(idx, idx + 1);
					elemLowerFn(lowerCtx);
					lowerCtx.storagePtr = Math.max(lowerCtx.storagePtr, elemPtr + elemSize32);
				}
				ctx.storagePtr = lowerCtx.storagePtr;
				return;
			}
			const elems = ctx.vals[0];
			if (knownLen === void 0) {
				if (!ctx.realloc) throw new Error("missing realloc during flat string lower");
				const dataPtr = ctx.realloc(0, 0, elemAlign32, elemSize32 * elems.length);
				ctx.vals[0] = dataPtr;
				_lowerFlatU32(ctx);
				ctx.vals[0] = elems.length;
				_lowerFlatU32(ctx);
				const origPtr = ctx.storagePtr;
				ctx.storagePtr = dataPtr;
				for (const [idx, elem] of elems.entries()) {
					const elemPtr = dataPtr + idx * elemSize32;
					ctx.storagePtr = elemPtr;
					ctx.vals = [elem];
					elemLowerFn(ctx);
					ctx.storagePtr = Math.max(ctx.storagePtr, elemPtr + elemSize32);
				}
				ctx.storagePtr = origPtr;
			} else {
				if (elems.length !== knownLen) throw new TypeError(`invalid list input of length [${elems.length}], must be length [${knownLen}]`);
				const originalPtr = ctx.storagePtr;
				for (const [idx, elem] of elems.entries()) {
					const elemPtr = originalPtr + idx * elemSize32;
					ctx.storagePtr = elemPtr;
					ctx.vals = [elem];
					elemLowerFn(ctx);
					ctx.storagePtr = Math.max(ctx.storagePtr, elemPtr + elemSize32);
				}
			}
			const totalSizeBytes = elems.length * size32;
			if (ctx.storageLen !== void 0 && totalSizeBytes > ctx.storageLen) throw new Error("not enough storage remaining for list flat lower");
		};
	}
	function _lowerFlatOption(meta) {
		const f = _lowerFlatVariant(meta);
		return function _lowerFlatOptionInner(ctx) {
			_debugLog("[_lowerFlatOption()] args", { ctx });
			const v = ctx.vals[0];
			if (v === null) ctx.vals[0] = { tag: "none" };
			else if (typeof v !== "object" || Object.keys(v).length !== 2 || !("tag" in v) || !(v.tag === "some" || v.tag === "none") || !("val" in v)) ctx.vals[0] = {
				tag: "some",
				val: v
			};
			f(ctx);
		};
	}
	function _lowerFlatResult(meta) {
		const f = _lowerFlatVariant(meta);
		return function _lowerFlatResultInner(ctx) {
			_debugLog("[_lowerFlatResult()] args", { ctx });
			const v = ctx.vals[0];
			if (typeof v !== "object" || Object.keys(v).length !== 2 || !("tag" in v) || !("ok" === v.tag || "err" === v.tag) || !("val" in v)) ctx.vals[0] = {
				tag: "ok",
				val: v
			};
			f(ctx);
		};
	}
	const STREAMS = new RepTable({ target: "global stream map" });
	const ASYNC_STATE = /* @__PURE__ */ new Map();
	function getOrCreateAsyncState(componentIdx, init) {
		if (!ASYNC_STATE.has(componentIdx)) {
			const newState = new ComponentAsyncState({ componentIdx });
			ASYNC_STATE.set(componentIdx, newState);
		}
		return ASYNC_STATE.get(componentIdx);
	}
	class ComponentAsyncState {
		static EVENT_HANDLER_EVENTS = ["backpressure-change"];
		#componentIdx;
		#callingAsyncImport = false;
		#syncImportWait = promiseWithResolvers();
		#locked = false;
		#parkedTasks = /* @__PURE__ */ new Map();
		#suspendedTasksByTaskID = /* @__PURE__ */ new Map();
		#suspendedTaskIDs = [];
		#errored = null;
		#backpressure = 0;
		#backpressureWaiters = 0n;
		#handlerMap = /* @__PURE__ */ new Map();
		#nextHandlerID = 0n;
		#tickLoop = null;
		#tickLoopInterval = null;
		#onExclusiveReleaseHandlers = [];
		mayLeave = true;
		handles;
		subtasks;
		constructor(args) {
			this.#componentIdx = args.componentIdx;
			this.handles = new RepTable({ target: `component [${this.#componentIdx}] handles (waitable objects)` });
			this.subtasks = new RepTable({ target: `component [${this.#componentIdx}] subtasks` });
		}
		componentIdx() {
			return this.#componentIdx;
		}
		errored() {
			return this.#errored !== null;
		}
		setErrored(err) {
			_debugLog("[ComponentAsyncState#setErrored()] component errored", {
				err,
				componentIdx: this.#componentIdx
			});
			if (this.#errored) return;
			if (!err) {
				err = /* @__PURE__ */ new Error("error elswehere (see other component instance error)");
				err.componentIdx = this.#componentIdx;
			}
			this.#errored = err;
		}
		callingSyncImport(val) {
			if (val === void 0) return this.#callingAsyncImport;
			if (typeof val !== "boolean") throw new TypeError("invalid setting for async import");
			const prev = this.#callingAsyncImport;
			this.#callingAsyncImport = val;
			if (prev === true && this.#callingAsyncImport === false) this.#notifySyncImportEnd();
		}
		#notifySyncImportEnd() {
			const existing = this.#syncImportWait;
			this.#syncImportWait = promiseWithResolvers();
			existing.resolve();
		}
		async waitForSyncImportCallEnd() {
			await this.#syncImportWait.promise;
		}
		setBackpressure(v) {
			this.#backpressure = v;
			return this.#backpressure;
		}
		getBackpressure() {
			return this.#backpressure;
		}
		incrementBackpressure() {
			const current = this.#backpressure;
			if (current < 0 || current > 2 ** 16) throw new Error(`invalid current backpressure value [${current}]`);
			const newValue = this.getBackpressure() + 1;
			if (newValue >= 2 ** 16) throw new Error(`invalid new backpressure value [${newValue}], overflow`);
			return this.setBackpressure(newValue);
		}
		decrementBackpressure() {
			const current = this.#backpressure;
			if (current < 0 || current > 2 ** 16) throw new Error(`invalid current backpressure value [${current}]`);
			const newValue = Math.max(0, current - 1);
			if (newValue < 0) throw new Error(`invalid new backpressure value [${newValue}], underflow`);
			return this.setBackpressure(newValue);
		}
		hasBackpressure() {
			return this.#backpressure > 0;
		}
		waitForBackpressure() {
			let backpressureCleared = false;
			const cstate = this;
			cstate.addBackpressureWaiter();
			const handlerID = this.registerHandler({
				event: "backpressure-change",
				fn: (bp) => {
					if (bp === 0) {
						cstate.removeHandler(handlerID);
						backpressureCleared = true;
					}
				}
			});
			return new Promise((resolve) => {
				const interval = setInterval(() => {
					if (backpressureCleared) return;
					clearInterval(interval);
					cstate.removeBackpressureWaiter();
					resolve(null);
				}, 0);
			});
		}
		registerHandler(args) {
			const { event, fn } = args;
			if (!event) throw new Error("missing handler event");
			if (!fn) throw new Error("missing handler fn");
			if (!ComponentAsyncState.EVENT_HANDLER_EVENTS.includes(event)) throw new Error(`unrecognized event handler [${event}]`);
			const handlerID = this.#nextHandlerID++;
			let handlers = this.#handlerMap.get(event);
			if (!handlers) {
				handlers = [];
				this.#handlerMap.set(event, handlers);
			}
			handlers.push({
				id: handlerID,
				fn,
				event
			});
			return handlerID;
		}
		removeHandler(args) {
			const { event, handlerID } = args;
			const registeredHandlers = this.#handlerMap.get(event);
			if (!registeredHandlers) return;
			if (!registeredHandlers.find((h) => h.id === handlerID)) return;
			this.#handlerMap.set(event, this.#handlerMap.get(event).filter((h) => h.id !== handlerID));
		}
		getBackpressureWaiters() {
			return this.#backpressureWaiters;
		}
		addBackpressureWaiter() {
			this.#backpressureWaiters++;
		}
		removeBackpressureWaiter() {
			this.#backpressureWaiters--;
			if (this.#backpressureWaiters < 0) throw new Error("unexepctedly negative number of backpressure waiters");
		}
		isExclusivelyLocked() {
			return this.#locked === true;
		}
		setLocked(locked) {
			this.#locked = locked;
		}
		exclusiveLock() {
			_debugLog("[ComponentAsyncState#exclusiveLock()]", {
				locked: this.#locked,
				componentIdx: this.#componentIdx
			});
			this.setLocked(true);
		}
		exclusiveRelease() {
			_debugLog("[ComponentAsyncState#exclusiveRelease()] args", {
				locked: this.#locked,
				componentIdx: this.#componentIdx
			});
			this.setLocked(false);
			this.#onExclusiveReleaseHandlers = this.#onExclusiveReleaseHandlers.filter((v) => !!v);
			for (const [idx, f] of this.#onExclusiveReleaseHandlers.entries()) try {
				this.#onExclusiveReleaseHandlers[idx] = null;
				f();
			} catch (err) {
				_debugLog("error while executing handler for next exclusive release", err);
				throw err;
			}
		}
		onNextExclusiveRelease(fn) {
			_debugLog("[ComponentAsyncState#()onNextExclusiveRelease] registering");
			this.#onExclusiveReleaseHandlers.push(fn);
		}
		#nextTaskPromise = Promise.resolve(true);
		#nextTaskQueue = [];
		async nextTaskExecutionSlot(args) {
			const { task } = args;
			const placeholder = {
				completed: false,
				task,
				promise: task.exitPromise().then(() => {
					placeholder.completed = true;
				})
			};
			this.#nextTaskQueue.push(placeholder);
			let next;
			while (true) {
				await this.#nextTaskPromise;
				next = this.#nextTaskQueue.find((placeholder) => !placeholder.completed);
				if (next === void 0 || next === placeholder) {
					this.#nextTaskPromise = next.promise;
					if (this.#nextTaskQueue.length > 1e3) {
						this.#nextTaskQueue = this.#nextTaskQueue.filter((p) => !p.completed);
						if (this.#nextTaskQueue.length > 1e3) _debugLog("[ComponentAsyncState#()nextTaskExecutionSlot] next task queue length > 1000 even after cleanup, tasks may be leaking");
					}
					break;
				}
			}
		}
		#getSuspendedTaskMeta(taskID) {
			return this.#suspendedTasksByTaskID.get(taskID);
		}
		#removeSuspendedTaskMeta(taskID) {
			_debugLog("[ComponentAsyncState#removeSuspendedTaskMeta()] removing suspended task", {
				taskID,
				componentIdx: this.#componentIdx
			});
			const idx = this.#suspendedTaskIDs.findIndex((t) => t === taskID);
			const meta = this.#suspendedTasksByTaskID.get(taskID);
			this.#suspendedTaskIDs[idx] = null;
			this.#suspendedTasksByTaskID.delete(taskID);
			return meta;
		}
		#addSuspendedTaskMeta(meta) {
			if (!meta) throw new Error("missing task meta");
			const taskID = meta.taskID;
			this.#suspendedTasksByTaskID.set(taskID, meta);
			this.#suspendedTaskIDs.push(taskID);
			if (this.#suspendedTasksByTaskID.size < this.#suspendedTaskIDs.length - 10) this.#suspendedTaskIDs = this.#suspendedTaskIDs.filter((t) => t !== null);
		}
		suspendTask(args) {
			const { task, readyFn } = args;
			const taskID = task.id();
			const componentIdx = task.componentIdx();
			_debugLog("[ComponentAsyncState#suspendTask()]", {
				taskID,
				componentIdx: this.#componentIdx,
				taskEntryFnName: task.entryFnName(),
				subtask: task.getParentSubtask()
			});
			if (componentIdx !== this.#componentIdx) throw new Error("assert: task component idx should match async state");
			if (this.#getSuspendedTaskMeta(taskID)) throw new Error(`task [${taskID}] already suspended`);
			const { promise, resolve, reject } = promiseWithResolvers();
			this.#addSuspendedTaskMeta({
				task,
				taskID,
				readyFn,
				resume: () => {
					_debugLog("[ComponentAsyncState] resuming suspended task", {
						taskID,
						componentIdx: this.#componentIdx
					});
					resolve(!task.isCancelled());
				}
			});
			this.runTickLoop();
			return promise;
		}
		resumeTaskByID(taskID) {
			const meta = this.#removeSuspendedTaskMeta(taskID);
			if (!meta) return;
			if (meta.taskID !== taskID) throw new Error("task ID does not match");
			meta.resume();
		}
		async runTickLoop() {
			if (this.#tickLoop !== null) return;
			this.#tickLoop = 1;
			setTimeout(async () => {
				let done = this.tick();
				while (!done) {
					await new Promise((resolve) => setTimeout(resolve, 30));
					done = this.tick();
				}
				this.#tickLoop = null;
			}, 10);
		}
		tick() {
			const resumableTasks = this.#suspendedTaskIDs.filter((t) => t !== null);
			for (const taskID of resumableTasks) {
				const meta = this.#suspendedTasksByTaskID.get(taskID);
				if (!meta || !meta.readyFn) throw new Error(`missing/invalid task despite ID [${taskID}] being present`);
				if (meta.task.isRejected()) {
					_debugLog("[ComponentAsyncState#tick()] detected task rejection, leaving early", { meta });
					this.resumeTaskByID(taskID);
					return;
				}
				if (!meta.readyFn()) continue;
				_debugLog("[ComponentAsyncState#tick()] resuming task via tick", {
					taskID,
					componentIdx: this.#componentIdx
				});
				this.resumeTaskByID(taskID);
			}
			return this.#suspendedTaskIDs.filter((t) => t !== null).length === 0;
		}
		addStreamEndToTable(args) {
			_debugLog("[ComponentAsyncState#addStreamEnd()] args", args);
			const { tableIdx, streamEnd } = args;
			if (typeof streamEnd === "number") throw new Error("INSERTING BAD STREAMEND");
			let { table, componentIdx } = STREAM_TABLES[tableIdx];
			if (componentIdx === void 0 || !table) throw new Error(`invalid global stream table state for table [${tableIdx}]`);
			const handle = table.insert(streamEnd);
			streamEnd.setHandle(handle);
			streamEnd.setStreamTableIdx(tableIdx);
			const waitableIdx = getOrCreateAsyncState(componentIdx).handles.insert(streamEnd);
			streamEnd.setWaitableIdx(waitableIdx);
			_debugLog("[ComponentAsyncState#addStreamEnd()] added stream end", {
				tableIdx,
				table,
				handle,
				streamEnd,
				destComponentIdx: componentIdx
			});
			return {
				handle,
				waitableIdx
			};
		}
		createWaitable(args) {
			return new Waitable({ target: args?.target });
		}
		createReadableStreamEnd(args) {
			_debugLog("[ComponentAsyncState#createStreamEnd()] args", args);
			const { tableIdx, elemMeta, hostInjectFn } = args;
			const { table: localStreamTable, componentIdx } = STREAM_TABLES[tableIdx];
			if (!localStreamTable) throw new Error(`missing global stream table lookup for table [${tableIdx}] while creating stream`);
			if (componentIdx !== this.#componentIdx) throw new Error("component idx mismatch while creating stream");
			const waitable = this.createWaitable();
			const streamEnd = new StreamReadableEnd({
				tableIdx,
				elemMeta,
				hostInjectFn,
				pendingBufferMeta: {},
				target: `stream read end (lowered, @init)`,
				waitable
			});
			streamEnd.setWaitableIdx(this.handles.insert(streamEnd));
			streamEnd.setHandle(localStreamTable.insert(streamEnd));
			if (streamEnd.streamTableIdx() !== tableIdx) throw new Error("unexpectedly mismatched stream table");
			const streamEndWaitableIdx = streamEnd.waitableIdx();
			const streamEndHandle = streamEnd.handle();
			waitable.setTarget(`waitable for stream read end (lowered, waitable [${streamEndWaitableIdx}])`);
			streamEnd.setTarget(`stream read end (lowered, waitable [${streamEndWaitableIdx}])`);
			return {
				waitableIdx: streamEndWaitableIdx,
				handle: streamEndHandle,
				streamEnd
			};
		}
		createStream(args) {
			_debugLog("[ComponentAsyncState#createStream()] args", args);
			const { tableIdx, elemMeta, hostInjectFn } = args;
			if (tableIdx === void 0) throw new Error("missing table idx while adding stream");
			if (elemMeta === void 0) throw new Error("missing element metadata while adding stream");
			const { table: localStreamTable, componentIdx } = STREAM_TABLES[tableIdx];
			if (!localStreamTable) throw new Error(`missing global stream table lookup for table [${tableIdx}] while creating stream`);
			if (componentIdx !== this.#componentIdx) throw new Error("component idx mismatch while creating stream");
			const readWaitable = this.createWaitable();
			const writeWaitable = this.createWaitable();
			const stream = new InternalStream({
				tableIdx,
				elemMeta,
				readWaitable,
				writeWaitable,
				hostInjectFn
			});
			stream.setGlobalStreamMapRep(STREAMS.insert(stream));
			const writeEnd = stream.writeEnd();
			writeEnd.setWaitableIdx(this.handles.insert(writeEnd));
			writeEnd.setHandle(localStreamTable.insert(writeEnd));
			if (writeEnd.streamTableIdx() !== tableIdx) throw new Error("unexpectedly mismatched stream table");
			const writeEndWaitableIdx = writeEnd.waitableIdx();
			const writeEndHandle = writeEnd.handle();
			writeWaitable.setTarget(`waitable for stream write end (waitable [${writeEndWaitableIdx}])`);
			writeEnd.setTarget(`stream write end (waitable [${writeEndWaitableIdx}])`);
			const readEnd = stream.readEnd();
			readEnd.setWaitableIdx(this.handles.insert(readEnd));
			readEnd.setHandle(localStreamTable.insert(readEnd));
			if (readEnd.streamTableIdx() !== tableIdx) throw new Error("unexpectedly mismatched stream table");
			const readEndWaitableIdx = readEnd.waitableIdx();
			const readEndHandle = readEnd.handle();
			readWaitable.setTarget(`waitable for read end (waitable [${readEndWaitableIdx}])`);
			readEnd.setTarget(`stream read end (waitable [${readEndWaitableIdx}])`);
			return {
				writeEnd,
				writeEndWaitableIdx,
				writeEndHandle,
				readEndWaitableIdx,
				readEndHandle,
				readEnd
			};
		}
		getStreamEnd(args) {
			_debugLog("[ComponentAsyncState#getStreamEnd()] args", args);
			const { tableIdx, streamEndHandle, streamEndWaitableIdx } = args;
			if (tableIdx === void 0) throw new Error("missing table idx while getting stream end");
			const { table, componentIdx } = STREAM_TABLES[tableIdx];
			const cstate = getOrCreateAsyncState(componentIdx);
			let streamEnd;
			if (streamEndWaitableIdx !== void 0) streamEnd = cstate.handles.get(streamEndWaitableIdx);
			else if (streamEndHandle !== void 0) {
				if (!table) throw new Error(`missing/invalid table [${tableIdx}] while getting stream end`);
				streamEnd = table.get(streamEndHandle);
			} else throw new TypeError("must specify either waitable idx or handle to retrieve stream");
			if (!streamEnd) throw new Error(`missing stream end (tableIdx [${tableIdx}], handle [${streamEndHandle}], waitableIdx [${streamEndWaitableIdx}])`);
			if (tableIdx && streamEnd.streamTableIdx() !== tableIdx) throw new Error(`stream end table idx [${streamEnd.streamTableIdx()}] does not match [${tableIdx}]`);
			return streamEnd;
		}
		deleteStreamEnd(args) {
			_debugLog("[ComponentAsyncState#deleteStreamEnd()] args", args);
			const { tableIdx, streamEndWaitableIdx } = args;
			if (tableIdx === void 0) throw new Error("missing table idx while removing stream end");
			if (streamEndWaitableIdx === void 0) throw new Error("missing stream idx while removing stream end");
			const { table, componentIdx } = STREAM_TABLES[tableIdx];
			const cstate = getOrCreateAsyncState(componentIdx);
			const streamEnd = cstate.handles.get(streamEndWaitableIdx);
			if (!streamEnd) throw new Error(`missing stream end [${streamEndWaitableIdx}] in component handles while deleting stream`);
			if (streamEnd.streamTableIdx() !== tableIdx) throw new Error(`stream end table idx [${streamEnd.streamTableIdx()}] does not match [${tableIdx}]`);
			let removed = cstate.handles.remove(streamEnd.waitableIdx());
			if (!removed) throw new Error(`failed to remove stream end [${streamEndWaitableIdx}] waitable obj in component [${componentIdx}]`);
			removed = table.remove(streamEnd.handle());
			if (!removed) throw new Error(`failed to remove stream end with handle [${streamEnd.handle()}] from stream table [${tableIdx}] in component [${componentIdx}]`);
			return streamEnd;
		}
		removeStreamEndFromTable(args) {
			_debugLog("[ComponentAsyncState#removeStreamEndFromTable()] args", args);
			const { tableIdx, streamWaitableIdx } = args;
			if (tableIdx === void 0) throw new Error("missing table idx while removing stream end");
			if (streamWaitableIdx === void 0) throw new Error("missing stream end waitable idx while removing stream end");
			const { table, componentIdx } = STREAM_TABLES[tableIdx];
			if (!table) throw new Error(`missing/invalid table [${tableIdx}] while removing stream end`);
			const cstate = getOrCreateAsyncState(componentIdx);
			const streamEnd = cstate.handles.get(streamWaitableIdx);
			if (!streamEnd) throw new Error(`missing stream end (handle [${streamWaitableIdx}], table [${tableIdx}])`);
			const handle = streamEnd.handle();
			let removed = cstate.handles.remove(streamWaitableIdx);
			if (!removed) throw new Error(`failed to remove streamEnd from handles (waitable idx [${streamWaitableIdx}]), component [${componentIdx}])`);
			removed = table.remove(handle);
			if (!removed) throw new Error(`failed to remove streamEnd from table (handle [${handle}]), table [${tableIdx}], component [${componentIdx}])`);
			return streamEnd;
		}
		createFuture(args) {
			_debugLog("[ComponentAsyncState#createFuture()] args", args);
			const { tableIdx, elemMeta, hostInjectFn } = args;
			if (tableIdx === void 0) throw new Error("missing table idx while adding future");
			if (elemMeta === void 0) throw new Error("missing element metadata while adding future");
			const { table: futureTable, componentIdx } = FUTURE_TABLES[tableIdx];
			if (!futureTable) throw new Error(`missing global future table lookup for table [${tableIdx}] while creating future`);
			if (componentIdx !== this.#componentIdx) throw new Error("component idx mismatch while creating future");
			const readWaitable = this.createWaitable();
			const writeWaitable = this.createWaitable();
			const future = new InternalFuture({
				tableIdx,
				componentIdx: this.#componentIdx,
				elemMeta,
				readWaitable,
				writeWaitable,
				hostInjectFn
			});
			future.setGlobalFutureMapRep(FUTURES.insert(future));
			const writeEnd = future.writeEnd();
			writeEnd.setWaitableIdx(this.handles.insert(writeEnd));
			writeEnd.setHandle(futureTable.insert(writeEnd));
			if (writeEnd.futureTableIdx() !== tableIdx) throw new Error("unexpectedly mismatched future table");
			const writeEndWaitableIdx = writeEnd.waitableIdx();
			const writeEndHandle = writeEnd.handle();
			writeWaitable.setTarget(`waitable for future write end (waitable [${writeEndWaitableIdx}])`);
			writeEnd.setTarget(`future write end (waitable [${writeEndWaitableIdx}])`);
			const readEnd = future.readEnd();
			readEnd.setWaitableIdx(this.handles.insert(readEnd));
			readEnd.setHandle(futureTable.insert(readEnd));
			if (readEnd.futureTableIdx() !== tableIdx) throw new Error("unexpectedly mismatched future table");
			const readEndWaitableIdx = readEnd.waitableIdx();
			const readEndHandle = readEnd.handle();
			readWaitable.setTarget(`waitable for read end (waitable [${readEndWaitableIdx}])`);
			readEnd.setTarget(`future read end (waitable [${readEndWaitableIdx}])`);
			return {
				writeEnd,
				writeEndWaitableIdx,
				writeEndHandle,
				readEndWaitableIdx,
				readEndHandle,
				readEnd
			};
		}
		getFutureEnd(args) {
			_debugLog("[ComponentAsyncState#getFutureEnd()] args", args);
			const { tableIdx, futureEndHandle, futureEndWaitableIdx } = args;
			if (tableIdx === void 0) throw new Error("missing table idx while getting future end");
			const { table, componentIdx } = FUTURE_TABLES[tableIdx];
			const cstate = getOrCreateAsyncState(componentIdx);
			let futureEnd;
			if (futureEndWaitableIdx !== void 0) futureEnd = cstate.handles.get(futureEndWaitableIdx);
			else if (futureEndHandle !== void 0) {
				if (!table) throw new Error(`missing/invalid table [${tableIdx}] while getting future end`);
				futureEnd = table.get(futureEndHandle);
			} else throw new TypeError("must specify either waitable idx or handle to retrieve future");
			if (!futureEnd) throw new Error(`missing future end (tableIdx [${tableIdx}], handle [${futureEndHandle}], waitableIdx [${futureEndWaitableIdx}])`);
			if (tableIdx && futureEnd.futureTableIdx() !== tableIdx) throw new Error(`future end table idx [${futureEnd.futureTableIdx()}] does not match [${tableIdx}]`);
			return futureEnd;
		}
		removeFutureEndFromTable(args) {
			_debugLog("[ComponentAsyncState#removeFutureEndFromTable()] args", args);
			const { tableIdx, futureWaitableIdx } = args;
			if (tableIdx === void 0) throw new Error("missing table idx while removing future end");
			if (futureWaitableIdx === void 0) throw new Error("missing future end waitable idx while removing future end");
			const { table, componentIdx } = FUTURE_TABLES[tableIdx];
			if (!table) throw new Error(`missing/invalid table [${tableIdx}] while removing future end`);
			const cstate = getOrCreateAsyncState(componentIdx);
			const futureEnd = cstate.handles.get(futureWaitableIdx);
			if (!futureEnd) throw new Error(`missing future end (handle [${futureWaitableIdx}], table [${tableIdx}])`);
			const handle = futureEnd.handle();
			let removed = cstate.handles.remove(futureWaitableIdx);
			if (!removed) throw new Error(`failed to remove futureEnd from handles (waitable idx [${futureWaitableIdx}]), component [${componentIdx}])`);
			removed = table.remove(handle);
			if (!removed) throw new Error(`failed to remove futureEnd from table (handle [${handle}]), table [${tableIdx}], component [${componentIdx}])`);
			return futureEnd;
		}
	}
	typeof process !== "undefined" && process.versions && process.versions.node;
	const symbolRscHandle = Symbol("handle");
	const HANDLE_TABLES = [];
	function finalizationRegistryCreate(unregister) {
		if (typeof FinalizationRegistry === "undefined") return { unregister() {} };
		return new FinalizationRegistry(unregister);
	}
	class ComponentError extends Error {
		constructor(value) {
			const enumerable = typeof value !== "string";
			super(enumerable ? `${String(value)} (see error.payload)` : value);
			Object.defineProperty(this, "payload", {
				value,
				enumerable
			});
		}
	}
	function getErrorPayload(e) {
		if (e && hasOwnProperty.call(e, "payload")) return e.payload;
		if (e instanceof Error) throw e;
		return e;
	}
	new Uint8Array(new Uint16Array([1]).buffer)[0];
	function throwInvalidBool() {
		throw new TypeError("invalid variant discriminant for bool");
	}
	const hasOwnProperty = Object.prototype.hasOwnProperty;
	if (!getCoreModule) throw new TypeError("getCoreModule is required");
	const module0 = getCoreModule("engine.core.wasm");
	const module1 = getCoreModule("engine.core2.wasm");
	const module2 = getCoreModule("engine.core3.wasm");
	const { fetch: fetch$1, today } = imports["typst:engine/host"];
	if (fetch$1 === void 0) {
		const err = /* @__PURE__ */ new Error("unexpectedly undefined instance import 'fetch$1', was 'fetch' available at instantiation?");
		console.error("ERROR:", err.toString());
		throw err;
	}
	if (today === void 0) {
		const err = /* @__PURE__ */ new Error("unexpectedly undefined instance import 'today', was 'today' available at instantiation?");
		console.error("ERROR:", err.toString());
		throw err;
	}
	let gen = (function* _initGenerator() {
		let exports0;
		let exports1;
		let memory0;
		let realloc0;
		const _trampoline2 = function(arg0, arg1, arg2, arg3) {
			var ptr0 = arg0;
			var len0 = arg1;
			var result0 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr0, len0));
			let enum1;
			switch (arg2) {
				case 0:
					enum1 = "project";
					break;
				case 1:
					enum1 = "package";
					break;
				case 2:
					enum1 = "url";
					break;
				default: throw new TypeError("invalid discriminant specified for FileKind");
			}
			_debugLog("[iface=\"typst:engine/host\", function=\"fetch\"] [Instruction::CallInterface] (sync, @ enter)");
			let parentTask;
			let task;
			let subtask;
			const createTask = () => {
				task = createNewCurrentTask({
					componentIdx: -1,
					isAsync: false,
					entryFnName: "fetch$1",
					getCallbackFn: () => null,
					callbackFnName: null,
					errHandling: "result-catch-handler",
					callingWasmExport: false
				})[0];
			};
			taskCreation: {
				parentTask = getCurrentTask(0, _getGlobalCurrentTaskMeta(0)?.taskID)?.task;
				if (!parentTask) {
					createTask();
					break taskCreation;
				}
				createTask();
				subtask = parentTask.getLatestSubtask();
				if (!subtask) throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
				task.setParentSubtask(subtask);
			}
			task.enterSync();
			let ret;
			try {
				ret = {
					tag: "ok",
					val: _withGlobalCurrentTaskMeta({
						componentIdx: task.componentIdx(),
						taskID: task.id(),
						fn: () => fetch$1({
							path: result0,
							kind: enum1
						})
					})
				};
			} catch (e) {
				ret = {
					tag: "err",
					val: getErrorPayload(e)
				};
			}
			var variant10 = ret;
			switch (variant10.tag) {
				case "ok": {
					const e = variant10.val;
					dataView(memory0).setInt8(arg3 + 0, 0, true);
					var { data: v2_0, resolvedPath: v2_1, mediaType: v2_2 } = e;
					var val3 = v2_0;
					var len3 = Array.isArray(val3) ? val3.length : val3.byteLength;
					var ptr3 = realloc0(0, 0, 1, len3 * 1);
					let valData3;
					const valLenBytes3 = len3 * 1;
					if (Array.isArray(val3)) {
						let offset = 0;
						const dv3 = new DataView(memory0.buffer);
						for (const v of val3) {
							_requireValidNumericPrimitive.bind(null, "u8")(v);
							dv3.setUint8(ptr3 + offset, v, true);
							offset += 1;
						}
					} else {
						valData3 = new Uint8Array(val3.buffer || val3, val3.byteOffset, valLenBytes3);
						new Uint8Array(memory0.buffer, ptr3, valLenBytes3).set(valData3);
					}
					dataView(memory0).setUint32(arg3 + 8, len3, true);
					dataView(memory0).setUint32(arg3 + 4, ptr3, true);
					var variant5 = v2_1;
					if (variant5 === null || variant5 === void 0) dataView(memory0).setInt8(arg3 + 12, 0, true);
					else {
						const e = variant5;
						dataView(memory0).setInt8(arg3 + 12, 1, true);
						var encodeRes = _utf8AllocateAndEncode(e, realloc0, memory0);
						var ptr4 = encodeRes.ptr;
						var len4 = encodeRes.len;
						dataView(memory0).setUint32(arg3 + 20, len4, true);
						dataView(memory0).setUint32(arg3 + 16, ptr4, true);
					}
					var variant7 = v2_2;
					if (variant7 === null || variant7 === void 0) dataView(memory0).setInt8(arg3 + 24, 0, true);
					else {
						const e = variant7;
						dataView(memory0).setInt8(arg3 + 24, 1, true);
						var encodeRes = _utf8AllocateAndEncode(e, realloc0, memory0);
						var ptr6 = encodeRes.ptr;
						var len6 = encodeRes.len;
						dataView(memory0).setUint32(arg3 + 32, len6, true);
						dataView(memory0).setUint32(arg3 + 28, ptr6, true);
					}
					break;
				}
				case "err": {
					const e = variant10.val;
					dataView(memory0).setInt8(arg3 + 0, 1, true);
					var variant9 = e;
					switch (variant9.tag) {
						case "not-found":
							dataView(memory0).setInt8(arg3 + 4, 0, true);
							break;
						case "denied":
							dataView(memory0).setInt8(arg3 + 4, 1, true);
							break;
						case "timeout":
							dataView(memory0).setInt8(arg3 + 4, 2, true);
							break;
						case "unavailable":
							dataView(memory0).setInt8(arg3 + 4, 3, true);
							break;
						case "other": {
							const e = variant9.val;
							dataView(memory0).setInt8(arg3 + 4, 4, true);
							var encodeRes = _utf8AllocateAndEncode(e, realloc0, memory0);
							var ptr8 = encodeRes.ptr;
							var len8 = encodeRes.len;
							dataView(memory0).setUint32(arg3 + 12, len8, true);
							dataView(memory0).setUint32(arg3 + 8, ptr8, true);
							break;
						}
						default: throw new TypeError(`invalid variant tag value \`${JSON.stringify(variant9.tag)}\` (received \`${variant9}\`) specified for \`FetchError\``);
					}
					break;
				}
				default:
					_debugLog("ERROR: invalid value (expected result as object with 'tag' member)", {
						value: variant10,
						valueType: typeof variant10
					});
					throw new TypeError("invalid variant specified for result");
			}
			_debugLog("[iface=\"typst:engine/host\", function=\"fetch\"][Instruction::Return]", {
				funcName: "fetch",
				paramCount: 0,
				async: false,
				postReturn: false
			});
			task.resolve([ret]);
			task.exit();
		};
		_trampoline2.fnName = "typst:engine/host#fetch$1";
		const _trampoline3 = function(arg0, arg1, arg2) {
			let variant0;
			switch (arg0) {
				case 0:
					variant0 = void 0;
					break;
				case 1:
					variant0 = arg1;
					break;
				default: throw new TypeError("invalid variant discriminant for option");
			}
			_debugLog("[iface=\"typst:engine/host\", function=\"today\"] [Instruction::CallInterface] (sync, @ enter)");
			let parentTask;
			let task;
			let subtask;
			const createTask = () => {
				task = createNewCurrentTask({
					componentIdx: -1,
					isAsync: false,
					entryFnName: "today",
					getCallbackFn: () => null,
					callbackFnName: null,
					errHandling: "none",
					callingWasmExport: false
				})[0];
			};
			taskCreation: {
				parentTask = getCurrentTask(0, _getGlobalCurrentTaskMeta(0)?.taskID)?.task;
				if (!parentTask) {
					createTask();
					break taskCreation;
				}
				createTask();
				subtask = parentTask.getLatestSubtask();
				if (!subtask) throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
				task.setParentSubtask(subtask);
			}
			task.enterSync();
			let ret;
			try {
				ret = _withGlobalCurrentTaskMeta({
					componentIdx: task.componentIdx(),
					taskID: task.id(),
					fn: () => today(variant0)
				});
			} catch (err) {
				_debugLog("[Instruction::CallInterface] error during sync call", {
					taskID: task.id(),
					subtaskID: task.getParentSubtask()?.id(),
					err
				});
				task.setErrored(err);
				task.reject(err);
				task.exit();
				throw err;
			}
			var variant2 = ret;
			if (variant2 === null || variant2 === void 0) dataView(memory0).setInt8(arg2 + 0, 0, true);
			else {
				const e = variant2;
				dataView(memory0).setInt8(arg2 + 0, 1, true);
				var { year: v1_0, month: v1_1, day: v1_2 } = e;
				dataView(memory0).setInt32(arg2 + 4, toUint32(v1_0), true);
				dataView(memory0).setInt8(arg2 + 8, toUint8(v1_1), true);
				dataView(memory0).setInt8(arg2 + 9, toUint8(v1_2), true);
			}
			_debugLog("[iface=\"typst:engine/host\", function=\"today\"][Instruction::Return]", {
				funcName: "today",
				paramCount: 0,
				async: false,
				postReturn: false
			});
			task.resolve([ret]);
			task.exit();
		};
		_trampoline3.fnName = "typst:engine/host#today";
		let exports2;
		let postReturn0;
		let postReturn1;
		let postReturn2;
		let postReturn3;
		const handleTable0 = [T_FLAG, 0];
		handleTable0._createdReps = /* @__PURE__ */ new Set();
		const finalizationRegistry0 = finalizationRegistryCreate((handle) => {
			const { rep } = rscTableRemove(handleTable0, handle);
			exports0["2"](rep);
		});
		HANDLE_TABLES[0] = handleTable0;
		let apiConstructorCompiler;
		class Compiler {
			constructor() {
				_debugLog("[iface=\"typst:engine/api\", function=\"[constructor]compiler\"][Instruction::CallWasm] enter", {
					funcName: "[constructor]compiler",
					paramCount: 0,
					async: false,
					postReturn: false
				});
				const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
					componentIdx: 0,
					isAsync: false,
					isManualAsync: false,
					entryFnName: "apiConstructorCompiler",
					getCallbackFn: () => null,
					callbackFnName: null,
					errHandling: "none",
					callingWasmExport: true
				});
				task.enterSync();
				let ret;
				try {
					ret = _withGlobalCurrentTaskMeta({
						taskID: task.id(),
						componentIdx: task.componentIdx(),
						fn: () => apiConstructorCompiler()
					});
				} catch (err) {
					_debugLog("[Instruction::CallWasm] error during sync call", {
						taskID: task.id(),
						err
					});
					task.setErrored(err);
					task.reject(err);
					task.exit();
					throw err;
				}
				var handle1 = ret;
				var rsc0 = new.target === Compiler ? this : Object.create(Compiler.prototype);
				Object.defineProperty(rsc0, symbolRscHandle, {
					writable: true,
					value: handle1
				});
				finalizationRegistry0.register(rsc0, handle1, rsc0);
				Object.defineProperty(rsc0, symbolDispose, {
					writable: true,
					value: function() {
						finalizationRegistry0.unregister(rsc0);
						rscTableRemove(handleTable0, handle1);
						rsc0[symbolDispose] = emptyFunc;
						rsc0[symbolRscHandle] = void 0;
						exports0["2"](handleTable0[(handle1 << 1) + 1] & ~T_FLAG);
					}
				});
				_debugLog("[iface=\"typst:engine/api\", function=\"[constructor]compiler\"][Instruction::Return]", {
					funcName: "[constructor]compiler",
					paramCount: 1,
					async: false,
					postReturn: false
				});
				task.resolve([rsc0]);
				task.exit();
				return rsc0;
			}
		}
		let apiMethodCompilerAddFont;
		Compiler.prototype.addFont = function addFont(arg1) {
			var handle1 = this[symbolRscHandle];
			if (!handle1 || (handleTable0[(handle1 << 1) + 1] & T_FLAG) === 0) throw new TypeError("Resource error: Not a valid \"Compiler\" resource.");
			var handle0 = handleTable0[(handle1 << 1) + 1] & ~T_FLAG;
			var val2 = arg1;
			var len2 = Array.isArray(val2) ? val2.length : val2.byteLength;
			var ptr2 = realloc0(0, 0, 1, len2 * 1);
			let valData2;
			const valLenBytes2 = len2 * 1;
			if (Array.isArray(val2)) {
				let offset = 0;
				const dv2 = new DataView(memory0.buffer);
				for (const v of val2) {
					_requireValidNumericPrimitive.bind(null, "u8")(v);
					dv2.setUint8(ptr2 + offset, v, true);
					offset += 1;
				}
			} else {
				valData2 = new Uint8Array(val2.buffer || val2, val2.byteOffset, valLenBytes2);
				new Uint8Array(memory0.buffer, ptr2, valLenBytes2).set(valData2);
			}
			_debugLog("[iface=\"typst:engine/api\", function=\"[method]compiler.add-font\"][Instruction::CallWasm] enter", {
				funcName: "[method]compiler.add-font",
				paramCount: 3,
				async: false,
				postReturn: true
			});
			const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
				componentIdx: 0,
				isAsync: false,
				isManualAsync: false,
				entryFnName: "apiMethodCompilerAddFont",
				getCallbackFn: () => null,
				callbackFnName: null,
				errHandling: "throw-result-err",
				callingWasmExport: true
			});
			task.enterSync();
			task.setReturnMemoryIdx(0);
			task.setReturnMemory(() => memory0());
			let ret;
			try {
				ret = _withGlobalCurrentTaskMeta({
					taskID: task.id(),
					componentIdx: task.componentIdx(),
					fn: () => apiMethodCompilerAddFont(handle0, ptr2, len2)
				});
			} catch (err) {
				_debugLog("[Instruction::CallWasm] error during sync call", {
					taskID: task.id(),
					err
				});
				task.setErrored(err);
				task.reject(err);
				task.exit();
				throw err;
			}
			let variant7;
			switch (dataView(memory0).getUint8(ret + 0, true)) {
				case 0:
					var ptr3 = dataView(memory0).getUint32(ret + 4, true);
					var len3 = dataView(memory0).getUint32(ret + 8, true);
					variant7 = {
						tag: "ok",
						val: TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr3, len3))
					};
					break;
				case 1: {
					let variant6;
					switch (dataView(memory0).getUint8(ret + 4, true)) {
						case 0:
							var ptr4 = dataView(memory0).getUint32(ret + 8, true);
							var len4 = dataView(memory0).getUint32(ret + 12, true);
							variant6 = {
								tag: "invalid-path",
								val: TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr4, len4))
							};
							break;
						case 1:
							variant6 = { tag: "font-parse-failed" };
							break;
						case 2:
							var ptr5 = dataView(memory0).getUint32(ret + 8, true);
							var len5 = dataView(memory0).getUint32(ret + 12, true);
							variant6 = {
								tag: "other",
								val: TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr5, len5))
							};
							break;
						default: throw new TypeError("invalid variant discriminant for OperationError");
					}
					variant7 = {
						tag: "err",
						val: variant6
					};
					break;
				}
				default: throw new TypeError("invalid variant discriminant for expected");
			}
			_debugLog("[iface=\"typst:engine/api\", function=\"[method]compiler.add-font\"][Instruction::Return]", {
				funcName: "[method]compiler.add-font",
				paramCount: 1,
				async: false,
				postReturn: true
			});
			const retCopy = variant7;
			task.resolve([retCopy.val]);
			let cstate = getOrCreateAsyncState(0);
			cstate.mayLeave = false;
			postReturn0(ret);
			cstate.mayLeave = true;
			task.exit();
			if (typeof retCopy === "object" && retCopy.tag === "err") throw new ComponentError(retCopy.val);
			return retCopy.val;
		};
		let apiMethodCompilerAddFile;
		Compiler.prototype.addFile = function addFile(arg1, arg2) {
			var handle1 = this[symbolRscHandle];
			if (!handle1 || (handleTable0[(handle1 << 1) + 1] & T_FLAG) === 0) throw new TypeError("Resource error: Not a valid \"Compiler\" resource.");
			var handle0 = handleTable0[(handle1 << 1) + 1] & ~T_FLAG;
			var encodeRes = _utf8AllocateAndEncode(arg1, realloc0, memory0);
			var ptr2 = encodeRes.ptr;
			var len2 = encodeRes.len;
			var val3 = arg2;
			var len3 = Array.isArray(val3) ? val3.length : val3.byteLength;
			var ptr3 = realloc0(0, 0, 1, len3 * 1);
			let valData3;
			const valLenBytes3 = len3 * 1;
			if (Array.isArray(val3)) {
				let offset = 0;
				const dv3 = new DataView(memory0.buffer);
				for (const v of val3) {
					_requireValidNumericPrimitive.bind(null, "u8")(v);
					dv3.setUint8(ptr3 + offset, v, true);
					offset += 1;
				}
			} else {
				valData3 = new Uint8Array(val3.buffer || val3, val3.byteOffset, valLenBytes3);
				new Uint8Array(memory0.buffer, ptr3, valLenBytes3).set(valData3);
			}
			_debugLog("[iface=\"typst:engine/api\", function=\"[method]compiler.add-file\"][Instruction::CallWasm] enter", {
				funcName: "[method]compiler.add-file",
				paramCount: 5,
				async: false,
				postReturn: true
			});
			const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
				componentIdx: 0,
				isAsync: false,
				isManualAsync: false,
				entryFnName: "apiMethodCompilerAddFile",
				getCallbackFn: () => null,
				callbackFnName: null,
				errHandling: "throw-result-err",
				callingWasmExport: true
			});
			task.enterSync();
			task.setReturnMemoryIdx(0);
			task.setReturnMemory(() => memory0());
			let ret;
			try {
				ret = _withGlobalCurrentTaskMeta({
					taskID: task.id(),
					componentIdx: task.componentIdx(),
					fn: () => apiMethodCompilerAddFile(handle0, ptr2, len2, ptr3, len3)
				});
			} catch (err) {
				_debugLog("[Instruction::CallWasm] error during sync call", {
					taskID: task.id(),
					err
				});
				task.setErrored(err);
				task.reject(err);
				task.exit();
				throw err;
			}
			let variant7;
			switch (dataView(memory0).getUint8(ret + 0, true)) {
				case 0:
					variant7 = {
						tag: "ok",
						val: void 0
					};
					break;
				case 1: {
					let variant6;
					switch (dataView(memory0).getUint8(ret + 4, true)) {
						case 0:
							var ptr4 = dataView(memory0).getUint32(ret + 8, true);
							var len4 = dataView(memory0).getUint32(ret + 12, true);
							variant6 = {
								tag: "invalid-path",
								val: TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr4, len4))
							};
							break;
						case 1:
							variant6 = { tag: "font-parse-failed" };
							break;
						case 2:
							var ptr5 = dataView(memory0).getUint32(ret + 8, true);
							var len5 = dataView(memory0).getUint32(ret + 12, true);
							variant6 = {
								tag: "other",
								val: TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr5, len5))
							};
							break;
						default: throw new TypeError("invalid variant discriminant for OperationError");
					}
					variant7 = {
						tag: "err",
						val: variant6
					};
					break;
				}
				default: throw new TypeError("invalid variant discriminant for expected");
			}
			_debugLog("[iface=\"typst:engine/api\", function=\"[method]compiler.add-file\"][Instruction::Return]", {
				funcName: "[method]compiler.add-file",
				paramCount: 1,
				async: false,
				postReturn: true
			});
			const retCopy = variant7;
			task.resolve([retCopy.val]);
			let cstate = getOrCreateAsyncState(0);
			cstate.mayLeave = false;
			postReturn1(ret);
			cstate.mayLeave = true;
			task.exit();
			if (typeof retCopy === "object" && retCopy.tag === "err") throw new ComponentError(retCopy.val);
			return retCopy.val;
		};
		let apiMethodCompilerAddSource;
		Compiler.prototype.addSource = function addSource(arg1, arg2) {
			var handle1 = this[symbolRscHandle];
			if (!handle1 || (handleTable0[(handle1 << 1) + 1] & T_FLAG) === 0) throw new TypeError("Resource error: Not a valid \"Compiler\" resource.");
			var handle0 = handleTable0[(handle1 << 1) + 1] & ~T_FLAG;
			var encodeRes = _utf8AllocateAndEncode(arg1, realloc0, memory0);
			var ptr2 = encodeRes.ptr;
			var len2 = encodeRes.len;
			var encodeRes = _utf8AllocateAndEncode(arg2, realloc0, memory0);
			var ptr3 = encodeRes.ptr;
			var len3 = encodeRes.len;
			_debugLog("[iface=\"typst:engine/api\", function=\"[method]compiler.add-source\"][Instruction::CallWasm] enter", {
				funcName: "[method]compiler.add-source",
				paramCount: 5,
				async: false,
				postReturn: true
			});
			const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
				componentIdx: 0,
				isAsync: false,
				isManualAsync: false,
				entryFnName: "apiMethodCompilerAddSource",
				getCallbackFn: () => null,
				callbackFnName: null,
				errHandling: "throw-result-err",
				callingWasmExport: true
			});
			task.enterSync();
			task.setReturnMemoryIdx(0);
			task.setReturnMemory(() => memory0());
			let ret;
			try {
				ret = _withGlobalCurrentTaskMeta({
					taskID: task.id(),
					componentIdx: task.componentIdx(),
					fn: () => apiMethodCompilerAddSource(handle0, ptr2, len2, ptr3, len3)
				});
			} catch (err) {
				_debugLog("[Instruction::CallWasm] error during sync call", {
					taskID: task.id(),
					err
				});
				task.setErrored(err);
				task.reject(err);
				task.exit();
				throw err;
			}
			let variant7;
			switch (dataView(memory0).getUint8(ret + 0, true)) {
				case 0:
					variant7 = {
						tag: "ok",
						val: void 0
					};
					break;
				case 1: {
					let variant6;
					switch (dataView(memory0).getUint8(ret + 4, true)) {
						case 0:
							var ptr4 = dataView(memory0).getUint32(ret + 8, true);
							var len4 = dataView(memory0).getUint32(ret + 12, true);
							variant6 = {
								tag: "invalid-path",
								val: TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr4, len4))
							};
							break;
						case 1:
							variant6 = { tag: "font-parse-failed" };
							break;
						case 2:
							var ptr5 = dataView(memory0).getUint32(ret + 8, true);
							var len5 = dataView(memory0).getUint32(ret + 12, true);
							variant6 = {
								tag: "other",
								val: TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr5, len5))
							};
							break;
						default: throw new TypeError("invalid variant discriminant for OperationError");
					}
					variant7 = {
						tag: "err",
						val: variant6
					};
					break;
				}
				default: throw new TypeError("invalid variant discriminant for expected");
			}
			_debugLog("[iface=\"typst:engine/api\", function=\"[method]compiler.add-source\"][Instruction::Return]", {
				funcName: "[method]compiler.add-source",
				paramCount: 1,
				async: false,
				postReturn: true
			});
			const retCopy = variant7;
			task.resolve([retCopy.val]);
			let cstate = getOrCreateAsyncState(0);
			cstate.mayLeave = false;
			postReturn1(ret);
			cstate.mayLeave = true;
			task.exit();
			if (typeof retCopy === "object" && retCopy.tag === "err") throw new ComponentError(retCopy.val);
			return retCopy.val;
		};
		let apiMethodCompilerSetMain;
		Compiler.prototype.setMain = function setMain(arg1) {
			var handle1 = this[symbolRscHandle];
			if (!handle1 || (handleTable0[(handle1 << 1) + 1] & T_FLAG) === 0) throw new TypeError("Resource error: Not a valid \"Compiler\" resource.");
			var handle0 = handleTable0[(handle1 << 1) + 1] & ~T_FLAG;
			var encodeRes = _utf8AllocateAndEncode(arg1, realloc0, memory0);
			var ptr2 = encodeRes.ptr;
			var len2 = encodeRes.len;
			_debugLog("[iface=\"typst:engine/api\", function=\"[method]compiler.set-main\"][Instruction::CallWasm] enter", {
				funcName: "[method]compiler.set-main",
				paramCount: 3,
				async: false,
				postReturn: true
			});
			const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
				componentIdx: 0,
				isAsync: false,
				isManualAsync: false,
				entryFnName: "apiMethodCompilerSetMain",
				getCallbackFn: () => null,
				callbackFnName: null,
				errHandling: "throw-result-err",
				callingWasmExport: true
			});
			task.enterSync();
			task.setReturnMemoryIdx(0);
			task.setReturnMemory(() => memory0());
			let ret;
			try {
				ret = _withGlobalCurrentTaskMeta({
					taskID: task.id(),
					componentIdx: task.componentIdx(),
					fn: () => apiMethodCompilerSetMain(handle0, ptr2, len2)
				});
			} catch (err) {
				_debugLog("[Instruction::CallWasm] error during sync call", {
					taskID: task.id(),
					err
				});
				task.setErrored(err);
				task.reject(err);
				task.exit();
				throw err;
			}
			let variant6;
			switch (dataView(memory0).getUint8(ret + 0, true)) {
				case 0:
					variant6 = {
						tag: "ok",
						val: void 0
					};
					break;
				case 1: {
					let variant5;
					switch (dataView(memory0).getUint8(ret + 4, true)) {
						case 0:
							var ptr3 = dataView(memory0).getUint32(ret + 8, true);
							var len3 = dataView(memory0).getUint32(ret + 12, true);
							variant5 = {
								tag: "invalid-path",
								val: TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr3, len3))
							};
							break;
						case 1:
							variant5 = { tag: "font-parse-failed" };
							break;
						case 2:
							var ptr4 = dataView(memory0).getUint32(ret + 8, true);
							var len4 = dataView(memory0).getUint32(ret + 12, true);
							variant5 = {
								tag: "other",
								val: TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr4, len4))
							};
							break;
						default: throw new TypeError("invalid variant discriminant for OperationError");
					}
					variant6 = {
						tag: "err",
						val: variant5
					};
					break;
				}
				default: throw new TypeError("invalid variant discriminant for expected");
			}
			_debugLog("[iface=\"typst:engine/api\", function=\"[method]compiler.set-main\"][Instruction::Return]", {
				funcName: "[method]compiler.set-main",
				paramCount: 1,
				async: false,
				postReturn: true
			});
			const retCopy = variant6;
			task.resolve([retCopy.val]);
			let cstate = getOrCreateAsyncState(0);
			cstate.mayLeave = false;
			postReturn1(ret);
			cstate.mayLeave = true;
			task.exit();
			if (typeof retCopy === "object" && retCopy.tag === "err") throw new ComponentError(retCopy.val);
			return retCopy.val;
		};
		let apiMethodCompilerRemoveFile;
		Compiler.prototype.removeFile = function removeFile(arg1) {
			var handle1 = this[symbolRscHandle];
			if (!handle1 || (handleTable0[(handle1 << 1) + 1] & T_FLAG) === 0) throw new TypeError("Resource error: Not a valid \"Compiler\" resource.");
			var handle0 = handleTable0[(handle1 << 1) + 1] & ~T_FLAG;
			var encodeRes = _utf8AllocateAndEncode(arg1, realloc0, memory0);
			var ptr2 = encodeRes.ptr;
			var len2 = encodeRes.len;
			_debugLog("[iface=\"typst:engine/api\", function=\"[method]compiler.remove-file\"][Instruction::CallWasm] enter", {
				funcName: "[method]compiler.remove-file",
				paramCount: 3,
				async: false,
				postReturn: true
			});
			const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
				componentIdx: 0,
				isAsync: false,
				isManualAsync: false,
				entryFnName: "apiMethodCompilerRemoveFile",
				getCallbackFn: () => null,
				callbackFnName: null,
				errHandling: "throw-result-err",
				callingWasmExport: true
			});
			task.enterSync();
			task.setReturnMemoryIdx(0);
			task.setReturnMemory(() => memory0());
			let ret;
			try {
				ret = _withGlobalCurrentTaskMeta({
					taskID: task.id(),
					componentIdx: task.componentIdx(),
					fn: () => apiMethodCompilerRemoveFile(handle0, ptr2, len2)
				});
			} catch (err) {
				_debugLog("[Instruction::CallWasm] error during sync call", {
					taskID: task.id(),
					err
				});
				task.setErrored(err);
				task.reject(err);
				task.exit();
				throw err;
			}
			let variant7;
			switch (dataView(memory0).getUint8(ret + 0, true)) {
				case 0:
					var bool3 = dataView(memory0).getUint8(ret + 4, true);
					variant7 = {
						tag: "ok",
						val: bool3 == 0 ? false : bool3 == 1 ? true : throwInvalidBool()
					};
					break;
				case 1: {
					let variant6;
					switch (dataView(memory0).getUint8(ret + 4, true)) {
						case 0:
							var ptr4 = dataView(memory0).getUint32(ret + 8, true);
							var len4 = dataView(memory0).getUint32(ret + 12, true);
							variant6 = {
								tag: "invalid-path",
								val: TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr4, len4))
							};
							break;
						case 1:
							variant6 = { tag: "font-parse-failed" };
							break;
						case 2:
							var ptr5 = dataView(memory0).getUint32(ret + 8, true);
							var len5 = dataView(memory0).getUint32(ret + 12, true);
							variant6 = {
								tag: "other",
								val: TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr5, len5))
							};
							break;
						default: throw new TypeError("invalid variant discriminant for OperationError");
					}
					variant7 = {
						tag: "err",
						val: variant6
					};
					break;
				}
				default: throw new TypeError("invalid variant discriminant for expected");
			}
			_debugLog("[iface=\"typst:engine/api\", function=\"[method]compiler.remove-file\"][Instruction::Return]", {
				funcName: "[method]compiler.remove-file",
				paramCount: 1,
				async: false,
				postReturn: true
			});
			const retCopy = variant7;
			task.resolve([retCopy.val]);
			let cstate = getOrCreateAsyncState(0);
			cstate.mayLeave = false;
			postReturn1(ret);
			cstate.mayLeave = true;
			task.exit();
			if (typeof retCopy === "object" && retCopy.tag === "err") throw new ComponentError(retCopy.val);
			return retCopy.val;
		};
		let apiMethodCompilerClearFiles;
		Compiler.prototype.clearFiles = function clearFiles() {
			var handle1 = this[symbolRscHandle];
			if (!handle1 || (handleTable0[(handle1 << 1) + 1] & T_FLAG) === 0) throw new TypeError("Resource error: Not a valid \"Compiler\" resource.");
			var handle0 = handleTable0[(handle1 << 1) + 1] & ~T_FLAG;
			_debugLog("[iface=\"typst:engine/api\", function=\"[method]compiler.clear-files\"][Instruction::CallWasm] enter", {
				funcName: "[method]compiler.clear-files",
				paramCount: 1,
				async: false,
				postReturn: true
			});
			const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
				componentIdx: 0,
				isAsync: false,
				isManualAsync: false,
				entryFnName: "apiMethodCompilerClearFiles",
				getCallbackFn: () => null,
				callbackFnName: null,
				errHandling: "throw-result-err",
				callingWasmExport: true
			});
			task.enterSync();
			task.setReturnMemoryIdx(0);
			task.setReturnMemory(() => memory0());
			let ret;
			try {
				ret = _withGlobalCurrentTaskMeta({
					taskID: task.id(),
					componentIdx: task.componentIdx(),
					fn: () => apiMethodCompilerClearFiles(handle0)
				});
			} catch (err) {
				_debugLog("[Instruction::CallWasm] error during sync call", {
					taskID: task.id(),
					err
				});
				task.setErrored(err);
				task.reject(err);
				task.exit();
				throw err;
			}
			let variant5;
			switch (dataView(memory0).getUint8(ret + 0, true)) {
				case 0:
					variant5 = {
						tag: "ok",
						val: void 0
					};
					break;
				case 1: {
					let variant4;
					switch (dataView(memory0).getUint8(ret + 4, true)) {
						case 0:
							var ptr2 = dataView(memory0).getUint32(ret + 8, true);
							var len2 = dataView(memory0).getUint32(ret + 12, true);
							variant4 = {
								tag: "invalid-path",
								val: TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr2, len2))
							};
							break;
						case 1:
							variant4 = { tag: "font-parse-failed" };
							break;
						case 2:
							var ptr3 = dataView(memory0).getUint32(ret + 8, true);
							var len3 = dataView(memory0).getUint32(ret + 12, true);
							variant4 = {
								tag: "other",
								val: TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr3, len3))
							};
							break;
						default: throw new TypeError("invalid variant discriminant for OperationError");
					}
					variant5 = {
						tag: "err",
						val: variant4
					};
					break;
				}
				default: throw new TypeError("invalid variant discriminant for expected");
			}
			_debugLog("[iface=\"typst:engine/api\", function=\"[method]compiler.clear-files\"][Instruction::Return]", {
				funcName: "[method]compiler.clear-files",
				paramCount: 1,
				async: false,
				postReturn: true
			});
			const retCopy = variant5;
			task.resolve([retCopy.val]);
			let cstate = getOrCreateAsyncState(0);
			cstate.mayLeave = false;
			postReturn1(ret);
			cstate.mayLeave = true;
			task.exit();
			if (typeof retCopy === "object" && retCopy.tag === "err") throw new ComponentError(retCopy.val);
			return retCopy.val;
		};
		let apiMethodCompilerListFiles;
		Compiler.prototype.listFiles = function listFiles() {
			var handle1 = this[symbolRscHandle];
			if (!handle1 || (handleTable0[(handle1 << 1) + 1] & T_FLAG) === 0) throw new TypeError("Resource error: Not a valid \"Compiler\" resource.");
			var handle0 = handleTable0[(handle1 << 1) + 1] & ~T_FLAG;
			_debugLog("[iface=\"typst:engine/api\", function=\"[method]compiler.list-files\"][Instruction::CallWasm] enter", {
				funcName: "[method]compiler.list-files",
				paramCount: 1,
				async: false,
				postReturn: true
			});
			const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
				componentIdx: 0,
				isAsync: false,
				isManualAsync: false,
				entryFnName: "apiMethodCompilerListFiles",
				getCallbackFn: () => null,
				callbackFnName: null,
				errHandling: "throw-result-err",
				callingWasmExport: true
			});
			task.enterSync();
			task.setReturnMemoryIdx(0);
			task.setReturnMemory(() => memory0());
			let ret;
			try {
				ret = _withGlobalCurrentTaskMeta({
					taskID: task.id(),
					componentIdx: task.componentIdx(),
					fn: () => apiMethodCompilerListFiles(handle0)
				});
			} catch (err) {
				_debugLog("[Instruction::CallWasm] error during sync call", {
					taskID: task.id(),
					err
				});
				task.setErrored(err);
				task.reject(err);
				task.exit();
				throw err;
			}
			let variant7;
			switch (dataView(memory0).getUint8(ret + 0, true)) {
				case 0:
					var len3 = dataView(memory0).getUint32(ret + 8, true);
					var base3 = dataView(memory0).getUint32(ret + 4, true);
					var result3 = [];
					for (let i = 0; i < len3; i++) {
						const base = base3 + i * 8;
						var ptr2 = dataView(memory0).getUint32(base + 0, true);
						var len2 = dataView(memory0).getUint32(base + 4, true);
						var result2 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr2, len2));
						result3.push(result2);
					}
					variant7 = {
						tag: "ok",
						val: result3
					};
					break;
				case 1: {
					let variant6;
					switch (dataView(memory0).getUint8(ret + 4, true)) {
						case 0:
							var ptr4 = dataView(memory0).getUint32(ret + 8, true);
							var len4 = dataView(memory0).getUint32(ret + 12, true);
							variant6 = {
								tag: "invalid-path",
								val: TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr4, len4))
							};
							break;
						case 1:
							variant6 = { tag: "font-parse-failed" };
							break;
						case 2:
							var ptr5 = dataView(memory0).getUint32(ret + 8, true);
							var len5 = dataView(memory0).getUint32(ret + 12, true);
							variant6 = {
								tag: "other",
								val: TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr5, len5))
							};
							break;
						default: throw new TypeError("invalid variant discriminant for OperationError");
					}
					variant7 = {
						tag: "err",
						val: variant6
					};
					break;
				}
				default: throw new TypeError("invalid variant discriminant for expected");
			}
			_debugLog("[iface=\"typst:engine/api\", function=\"[method]compiler.list-files\"][Instruction::Return]", {
				funcName: "[method]compiler.list-files",
				paramCount: 1,
				async: false,
				postReturn: true
			});
			const retCopy = variant7;
			task.resolve([retCopy.val]);
			let cstate = getOrCreateAsyncState(0);
			cstate.mayLeave = false;
			postReturn2(ret);
			cstate.mayLeave = true;
			task.exit();
			if (typeof retCopy === "object" && retCopy.tag === "err") throw new ComponentError(retCopy.val);
			return retCopy.val;
		};
		let apiMethodCompilerHasFile;
		Compiler.prototype.hasFile = function hasFile(arg1) {
			var handle1 = this[symbolRscHandle];
			if (!handle1 || (handleTable0[(handle1 << 1) + 1] & T_FLAG) === 0) throw new TypeError("Resource error: Not a valid \"Compiler\" resource.");
			var handle0 = handleTable0[(handle1 << 1) + 1] & ~T_FLAG;
			var encodeRes = _utf8AllocateAndEncode(arg1, realloc0, memory0);
			var ptr2 = encodeRes.ptr;
			var len2 = encodeRes.len;
			_debugLog("[iface=\"typst:engine/api\", function=\"[method]compiler.has-file\"][Instruction::CallWasm] enter", {
				funcName: "[method]compiler.has-file",
				paramCount: 3,
				async: false,
				postReturn: true
			});
			const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
				componentIdx: 0,
				isAsync: false,
				isManualAsync: false,
				entryFnName: "apiMethodCompilerHasFile",
				getCallbackFn: () => null,
				callbackFnName: null,
				errHandling: "throw-result-err",
				callingWasmExport: true
			});
			task.enterSync();
			task.setReturnMemoryIdx(0);
			task.setReturnMemory(() => memory0());
			let ret;
			try {
				ret = _withGlobalCurrentTaskMeta({
					taskID: task.id(),
					componentIdx: task.componentIdx(),
					fn: () => apiMethodCompilerHasFile(handle0, ptr2, len2)
				});
			} catch (err) {
				_debugLog("[Instruction::CallWasm] error during sync call", {
					taskID: task.id(),
					err
				});
				task.setErrored(err);
				task.reject(err);
				task.exit();
				throw err;
			}
			let variant7;
			switch (dataView(memory0).getUint8(ret + 0, true)) {
				case 0:
					var bool3 = dataView(memory0).getUint8(ret + 4, true);
					variant7 = {
						tag: "ok",
						val: bool3 == 0 ? false : bool3 == 1 ? true : throwInvalidBool()
					};
					break;
				case 1: {
					let variant6;
					switch (dataView(memory0).getUint8(ret + 4, true)) {
						case 0:
							var ptr4 = dataView(memory0).getUint32(ret + 8, true);
							var len4 = dataView(memory0).getUint32(ret + 12, true);
							variant6 = {
								tag: "invalid-path",
								val: TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr4, len4))
							};
							break;
						case 1:
							variant6 = { tag: "font-parse-failed" };
							break;
						case 2:
							var ptr5 = dataView(memory0).getUint32(ret + 8, true);
							var len5 = dataView(memory0).getUint32(ret + 12, true);
							variant6 = {
								tag: "other",
								val: TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr5, len5))
							};
							break;
						default: throw new TypeError("invalid variant discriminant for OperationError");
					}
					variant7 = {
						tag: "err",
						val: variant6
					};
					break;
				}
				default: throw new TypeError("invalid variant discriminant for expected");
			}
			_debugLog("[iface=\"typst:engine/api\", function=\"[method]compiler.has-file\"][Instruction::Return]", {
				funcName: "[method]compiler.has-file",
				paramCount: 1,
				async: false,
				postReturn: true
			});
			const retCopy = variant7;
			task.resolve([retCopy.val]);
			let cstate = getOrCreateAsyncState(0);
			cstate.mayLeave = false;
			postReturn1(ret);
			cstate.mayLeave = true;
			task.exit();
			if (typeof retCopy === "object" && retCopy.tag === "err") throw new ComponentError(retCopy.val);
			return retCopy.val;
		};
		let apiMethodCompilerCompile;
		Compiler.prototype.compile = function compile(arg1) {
			var ptr0 = realloc0(0, 0, 4, 64);
			var handle2 = this[symbolRscHandle];
			if (!handle2 || (handleTable0[(handle2 << 1) + 1] & T_FLAG) === 0) throw new TypeError("Resource error: Not a valid \"Compiler\" resource.");
			var handle1 = handleTable0[(handle2 << 1) + 1] & ~T_FLAG;
			dataView(memory0).setInt32(ptr0 + 0, handle1, true);
			var { format: v3_0, main: v3_1, inputs: v3_2, pages: v3_3, pdfStandards: v3_4, ppi: v3_5 } = arg1;
			var variant5 = v3_0;
			if (variant5 === null || variant5 === void 0) dataView(memory0).setInt8(ptr0 + 4, 0, true);
			else {
				const e = variant5;
				dataView(memory0).setInt8(ptr0 + 4, 1, true);
				var val4 = e;
				let enum4;
				switch (val4) {
					case "pdf":
						enum4 = 0;
						break;
					case "png":
						enum4 = 1;
						break;
					case "svg":
						enum4 = 2;
						break;
					case "html":
						enum4 = 3;
						break;
					case "bundle":
						enum4 = 4;
						break;
					default:
						if (e instanceof Error) console.error(e);
						throw new TypeError(`"${val4}" is not one of the cases of compile-format`);
				}
				dataView(memory0).setInt8(ptr0 + 5, enum4, true);
			}
			var variant7 = v3_1;
			if (variant7 === null || variant7 === void 0) dataView(memory0).setInt8(ptr0 + 8, 0, true);
			else {
				const e = variant7;
				dataView(memory0).setInt8(ptr0 + 8, 1, true);
				var encodeRes = _utf8AllocateAndEncode(e, realloc0, memory0);
				var ptr6 = encodeRes.ptr;
				var len6 = encodeRes.len;
				dataView(memory0).setUint32(ptr0 + 16, len6, true);
				dataView(memory0).setUint32(ptr0 + 12, ptr6, true);
			}
			var variant12 = v3_2;
			if (variant12 === null || variant12 === void 0) dataView(memory0).setInt8(ptr0 + 20, 0, true);
			else {
				const e = variant12;
				dataView(memory0).setInt8(ptr0 + 20, 1, true);
				var vec11 = e;
				var len11 = vec11.length;
				var result11 = realloc0(0, 0, 4, len11 * 16);
				for (let i = 0; i < vec11.length; i++) {
					const e = vec11[i];
					const base = result11 + i * 16;
					var { key: v8_0, value: v8_1 } = e;
					var encodeRes = _utf8AllocateAndEncode(v8_0, realloc0, memory0);
					var ptr9 = encodeRes.ptr;
					var len9 = encodeRes.len;
					dataView(memory0).setUint32(base + 4, len9, true);
					dataView(memory0).setUint32(base + 0, ptr9, true);
					var encodeRes = _utf8AllocateAndEncode(v8_1, realloc0, memory0);
					var ptr10 = encodeRes.ptr;
					var len10 = encodeRes.len;
					dataView(memory0).setUint32(base + 12, len10, true);
					dataView(memory0).setUint32(base + 8, ptr10, true);
				}
				dataView(memory0).setUint32(ptr0 + 28, len11, true);
				dataView(memory0).setUint32(ptr0 + 24, result11, true);
			}
			var variant14 = v3_3;
			if (variant14 === null || variant14 === void 0) dataView(memory0).setInt8(ptr0 + 32, 0, true);
			else {
				const e = variant14;
				dataView(memory0).setInt8(ptr0 + 32, 1, true);
				var encodeRes = _utf8AllocateAndEncode(e, realloc0, memory0);
				var ptr13 = encodeRes.ptr;
				var len13 = encodeRes.len;
				dataView(memory0).setUint32(ptr0 + 40, len13, true);
				dataView(memory0).setUint32(ptr0 + 36, ptr13, true);
			}
			var variant17 = v3_4;
			if (variant17 === null || variant17 === void 0) dataView(memory0).setInt8(ptr0 + 44, 0, true);
			else {
				const e = variant17;
				dataView(memory0).setInt8(ptr0 + 44, 1, true);
				var vec16 = e;
				var len16 = vec16.length;
				var result16 = realloc0(0, 0, 1, len16 * 1);
				for (let i = 0; i < vec16.length; i++) {
					const e = vec16[i];
					const base = result16 + i * 1;
					var val15 = e;
					let enum15;
					switch (val15) {
						case "v17":
							enum15 = 0;
							break;
						case "a2b":
							enum15 = 1;
							break;
						case "a3b":
							enum15 = 2;
							break;
						default:
							if (e instanceof Error) console.error(e);
							throw new TypeError(`"${val15}" is not one of the cases of pdf-standard`);
					}
					dataView(memory0).setInt8(base + 0, enum15, true);
				}
				dataView(memory0).setUint32(ptr0 + 52, len16, true);
				dataView(memory0).setUint32(ptr0 + 48, result16, true);
			}
			var variant18 = v3_5;
			if (variant18 === null || variant18 === void 0) dataView(memory0).setInt8(ptr0 + 56, 0, true);
			else {
				const e = variant18;
				dataView(memory0).setInt8(ptr0 + 56, 1, true);
				dataView(memory0).setFloat32(ptr0 + 60, +e, true);
			}
			_debugLog("[iface=\"typst:engine/api\", function=\"[method]compiler.compile\"][Instruction::CallWasm] enter", {
				funcName: "[method]compiler.compile",
				paramCount: 1,
				async: false,
				postReturn: true
			});
			const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
				componentIdx: 0,
				isAsync: false,
				isManualAsync: false,
				entryFnName: "apiMethodCompilerCompile",
				getCallbackFn: () => null,
				callbackFnName: null,
				errHandling: "throw-result-err",
				callingWasmExport: true
			});
			task.enterSync();
			task.setReturnMemoryIdx(0);
			task.setReturnMemory(() => memory0());
			let ret;
			try {
				ret = _withGlobalCurrentTaskMeta({
					taskID: task.id(),
					componentIdx: task.componentIdx(),
					fn: () => apiMethodCompilerCompile(ptr0)
				});
			} catch (err) {
				_debugLog("[Instruction::CallWasm] error during sync call", {
					taskID: task.id(),
					err
				});
				task.setErrored(err);
				task.reject(err);
				task.exit();
				throw err;
			}
			let variant88;
			switch (dataView(memory0).getUint8(ret + 0, true)) {
				case 0: {
					let variant30;
					switch (dataView(memory0).getUint8(ret + 4, true)) {
						case 0:
							var ptr19 = dataView(memory0).getUint32(ret + 8, true);
							var len19 = dataView(memory0).getUint32(ret + 12, true);
							variant30 = {
								tag: "pdf",
								val: new Uint8Array(memory0.buffer.slice(ptr19, ptr19 + len19 * 1))
							};
							break;
						case 1:
							var len21 = dataView(memory0).getUint32(ret + 12, true);
							var base21 = dataView(memory0).getUint32(ret + 8, true);
							var result21 = [];
							for (let i = 0; i < len21; i++) {
								const base = base21 + i * 12;
								var ptr20 = dataView(memory0).getUint32(base + 4, true);
								var len20 = dataView(memory0).getUint32(base + 8, true);
								var result20 = new Uint8Array(memory0.buffer.slice(ptr20, ptr20 + len20 * 1));
								result21.push({
									page: dataView(memory0).getInt32(base + 0, true) >>> 0,
									data: result20
								});
							}
							variant30 = {
								tag: "png",
								val: result21
							};
							break;
						case 2:
							var len23 = dataView(memory0).getUint32(ret + 12, true);
							var base23 = dataView(memory0).getUint32(ret + 8, true);
							var result23 = [];
							for (let i = 0; i < len23; i++) {
								const base = base23 + i * 12;
								var ptr22 = dataView(memory0).getUint32(base + 4, true);
								var len22 = dataView(memory0).getUint32(base + 8, true);
								var result22 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr22, len22));
								result23.push({
									page: dataView(memory0).getInt32(base + 0, true) >>> 0,
									data: result22
								});
							}
							variant30 = {
								tag: "svg",
								val: result23
							};
							break;
						case 3:
							var ptr24 = dataView(memory0).getUint32(ret + 8, true);
							var len24 = dataView(memory0).getUint32(ret + 12, true);
							variant30 = {
								tag: "html",
								val: TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr24, len24))
							};
							break;
						case 4:
							var len29 = dataView(memory0).getUint32(ret + 12, true);
							var base29 = dataView(memory0).getUint32(ret + 8, true);
							var result29 = [];
							for (let i = 0; i < len29; i++) {
								const base = base29 + i * 28;
								var ptr25 = dataView(memory0).getUint32(base + 0, true);
								var len25 = dataView(memory0).getUint32(base + 4, true);
								var result25 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr25, len25));
								var ptr26 = dataView(memory0).getUint32(base + 8, true);
								var len26 = dataView(memory0).getUint32(base + 12, true);
								var result26 = new Uint8Array(memory0.buffer.slice(ptr26, ptr26 + len26 * 1));
								let variant28;
								switch (dataView(memory0).getUint8(base + 16, true)) {
									case 0:
										variant28 = void 0;
										break;
									case 1:
										var ptr27 = dataView(memory0).getUint32(base + 20, true);
										var len27 = dataView(memory0).getUint32(base + 24, true);
										variant28 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr27, len27));
										break;
									default: throw new TypeError("invalid variant discriminant for option");
								}
								result29.push({
									path: result25,
									data: result26,
									mediaType: variant28
								});
							}
							variant30 = {
								tag: "bundle",
								val: result29
							};
							break;
						default: throw new TypeError("invalid variant discriminant for CompilePayload");
					}
					var len44 = dataView(memory0).getUint32(ret + 20, true);
					var base44 = dataView(memory0).getUint32(ret + 16, true);
					var result44 = [];
					for (let i = 0; i < len44; i++) {
						const base = base44 + i * 80;
						var ptr31 = dataView(memory0).getUint32(base + 0, true);
						var len31 = dataView(memory0).getUint32(base + 4, true);
						var result31 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr31, len31));
						let enum32;
						switch (dataView(memory0).getUint8(base + 8, true)) {
							case 0:
								enum32 = "warning";
								break;
							case 1:
								enum32 = "error";
								break;
							default: throw new TypeError("invalid discriminant specified for DiagnosticSeverity");
						}
						let variant34;
						switch (dataView(memory0).getUint8(base + 12, true)) {
							case 0:
								variant34 = void 0;
								break;
							case 1:
								var ptr33 = dataView(memory0).getUint32(base + 16, true);
								var len33 = dataView(memory0).getUint32(base + 20, true);
								variant34 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr33, len33));
								break;
							default: throw new TypeError("invalid variant discriminant for option");
						}
						let variant35;
						switch (dataView(memory0).getUint8(base + 24, true)) {
							case 0:
								variant35 = void 0;
								break;
							case 1:
								variant35 = dataView(memory0).getInt32(base + 28, true) >>> 0;
								break;
							default: throw new TypeError("invalid variant discriminant for option");
						}
						let variant36;
						switch (dataView(memory0).getUint8(base + 32, true)) {
							case 0:
								variant36 = void 0;
								break;
							case 1:
								variant36 = dataView(memory0).getInt32(base + 36, true) >>> 0;
								break;
							default: throw new TypeError("invalid variant discriminant for option");
						}
						let variant37;
						switch (dataView(memory0).getUint8(base + 40, true)) {
							case 0:
								variant37 = void 0;
								break;
							case 1:
								variant37 = dataView(memory0).getInt32(base + 44, true) >>> 0;
								break;
							default: throw new TypeError("invalid variant discriminant for option");
						}
						let variant38;
						switch (dataView(memory0).getUint8(base + 48, true)) {
							case 0:
								variant38 = void 0;
								break;
							case 1:
								variant38 = dataView(memory0).getInt32(base + 52, true) >>> 0;
								break;
							default: throw new TypeError("invalid variant discriminant for option");
						}
						var ptr39 = dataView(memory0).getUint32(base + 56, true);
						var len39 = dataView(memory0).getUint32(base + 60, true);
						var result39 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr39, len39));
						var len41 = dataView(memory0).getUint32(base + 68, true);
						var base41 = dataView(memory0).getUint32(base + 64, true);
						var result41 = [];
						for (let i = 0; i < len41; i++) {
							const base = base41 + i * 8;
							var ptr40 = dataView(memory0).getUint32(base + 0, true);
							var len40 = dataView(memory0).getUint32(base + 4, true);
							var result40 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr40, len40));
							result41.push(result40);
						}
						var len43 = dataView(memory0).getUint32(base + 76, true);
						var base43 = dataView(memory0).getUint32(base + 72, true);
						var result43 = [];
						for (let i = 0; i < len43; i++) {
							const base = base43 + i * 8;
							var ptr42 = dataView(memory0).getUint32(base + 0, true);
							var len42 = dataView(memory0).getUint32(base + 4, true);
							var result42 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr42, len42));
							result43.push(result42);
						}
						result44.push({
							message: result31,
							severity: enum32,
							file: variant34,
							line: variant35,
							column: variant36,
							start: variant37,
							end: variant38,
							formatted: result39,
							hints: result41,
							trace: result43
						});
					}
					let variant57;
					switch (dataView(memory0).getUint8(ret + 24, true)) {
						case 0:
							variant57 = void 0;
							break;
						case 1: {
							let variant46;
							switch (dataView(memory0).getUint8(ret + 28, true)) {
								case 0:
									variant46 = void 0;
									break;
								case 1:
									var ptr45 = dataView(memory0).getUint32(ret + 32, true);
									var len45 = dataView(memory0).getUint32(ret + 36, true);
									variant46 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr45, len45));
									break;
								default: throw new TypeError("invalid variant discriminant for option");
							}
							let variant48;
							switch (dataView(memory0).getUint8(ret + 40, true)) {
								case 0:
									variant48 = void 0;
									break;
								case 1:
									var ptr47 = dataView(memory0).getUint32(ret + 44, true);
									var len47 = dataView(memory0).getUint32(ret + 48, true);
									variant48 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr47, len47));
									break;
								default: throw new TypeError("invalid variant discriminant for option");
							}
							var len50 = dataView(memory0).getUint32(ret + 56, true);
							var base50 = dataView(memory0).getUint32(ret + 52, true);
							var result50 = [];
							for (let i = 0; i < len50; i++) {
								const base = base50 + i * 8;
								var ptr49 = dataView(memory0).getUint32(base + 0, true);
								var len49 = dataView(memory0).getUint32(base + 4, true);
								var result49 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr49, len49));
								result50.push(result49);
							}
							var len52 = dataView(memory0).getUint32(ret + 64, true);
							var base52 = dataView(memory0).getUint32(ret + 60, true);
							var result52 = [];
							for (let i = 0; i < len52; i++) {
								const base = base52 + i * 8;
								var ptr51 = dataView(memory0).getUint32(base + 0, true);
								var len51 = dataView(memory0).getUint32(base + 4, true);
								var result51 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr51, len51));
								result52.push(result51);
							}
							var len56 = dataView(memory0).getUint32(ret + 72, true);
							var base56 = dataView(memory0).getUint32(ret + 68, true);
							var result56 = [];
							for (let i = 0; i < len56; i++) {
								const base = base56 + i * 20;
								let variant54;
								switch (dataView(memory0).getUint8(base + 0, true)) {
									case 0:
										variant54 = void 0;
										break;
									case 1:
										var ptr53 = dataView(memory0).getUint32(base + 4, true);
										var len53 = dataView(memory0).getUint32(base + 8, true);
										variant54 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr53, len53));
										break;
									default: throw new TypeError("invalid variant discriminant for option");
								}
								var ptr55 = dataView(memory0).getUint32(base + 12, true);
								var len55 = dataView(memory0).getUint32(base + 16, true);
								var result55 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr55, len55));
								result56.push({
									label: variant54,
									valueJson: result55
								});
							}
							variant57 = {
								title: variant46,
								description: variant48,
								author: result50,
								keywords: result52,
								custom: result56
							};
							break;
						}
						default: throw new TypeError("invalid variant discriminant for option");
					}
					var len64 = dataView(memory0).getUint32(ret + 80, true);
					var base64 = dataView(memory0).getUint32(ret + 76, true);
					var result64 = [];
					for (let i = 0; i < len64; i++) {
						const base = base64 + i * 36;
						let enum58;
						switch (dataView(memory0).getUint8(base + 0, true)) {
							case 0:
								enum58 = "project";
								break;
							case 1:
								enum58 = "package";
								break;
							case 2:
								enum58 = "url";
								break;
							default: throw new TypeError("invalid discriminant specified for FileKind");
						}
						var ptr59 = dataView(memory0).getUint32(base + 4, true);
						var len59 = dataView(memory0).getUint32(base + 8, true);
						var result59 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr59, len59));
						let variant61;
						switch (dataView(memory0).getUint8(base + 12, true)) {
							case 0:
								variant61 = void 0;
								break;
							case 1:
								var ptr60 = dataView(memory0).getUint32(base + 16, true);
								var len60 = dataView(memory0).getUint32(base + 20, true);
								variant61 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr60, len60));
								break;
							default: throw new TypeError("invalid variant discriminant for option");
						}
						let variant63;
						switch (dataView(memory0).getUint8(base + 24, true)) {
							case 0:
								variant63 = void 0;
								break;
							case 1:
								var ptr62 = dataView(memory0).getUint32(base + 28, true);
								var len62 = dataView(memory0).getUint32(base + 32, true);
								variant63 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr62, len62));
								break;
							default: throw new TypeError("invalid variant discriminant for option");
						}
						result64.push({
							kind: enum58,
							path: result59,
							resolvedPath: variant61,
							mediaType: variant63
						});
					}
					variant88 = {
						tag: "ok",
						val: {
							output: variant30,
							diagnostics: result44,
							metadata: variant57,
							dependencies: result64
						}
					};
					break;
				}
				case 1: {
					var len78 = dataView(memory0).getUint32(ret + 8, true);
					var base78 = dataView(memory0).getUint32(ret + 4, true);
					var result78 = [];
					for (let i = 0; i < len78; i++) {
						const base = base78 + i * 80;
						var ptr65 = dataView(memory0).getUint32(base + 0, true);
						var len65 = dataView(memory0).getUint32(base + 4, true);
						var result65 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr65, len65));
						let enum66;
						switch (dataView(memory0).getUint8(base + 8, true)) {
							case 0:
								enum66 = "warning";
								break;
							case 1:
								enum66 = "error";
								break;
							default: throw new TypeError("invalid discriminant specified for DiagnosticSeverity");
						}
						let variant68;
						switch (dataView(memory0).getUint8(base + 12, true)) {
							case 0:
								variant68 = void 0;
								break;
							case 1:
								var ptr67 = dataView(memory0).getUint32(base + 16, true);
								var len67 = dataView(memory0).getUint32(base + 20, true);
								variant68 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr67, len67));
								break;
							default: throw new TypeError("invalid variant discriminant for option");
						}
						let variant69;
						switch (dataView(memory0).getUint8(base + 24, true)) {
							case 0:
								variant69 = void 0;
								break;
							case 1:
								variant69 = dataView(memory0).getInt32(base + 28, true) >>> 0;
								break;
							default: throw new TypeError("invalid variant discriminant for option");
						}
						let variant70;
						switch (dataView(memory0).getUint8(base + 32, true)) {
							case 0:
								variant70 = void 0;
								break;
							case 1:
								variant70 = dataView(memory0).getInt32(base + 36, true) >>> 0;
								break;
							default: throw new TypeError("invalid variant discriminant for option");
						}
						let variant71;
						switch (dataView(memory0).getUint8(base + 40, true)) {
							case 0:
								variant71 = void 0;
								break;
							case 1:
								variant71 = dataView(memory0).getInt32(base + 44, true) >>> 0;
								break;
							default: throw new TypeError("invalid variant discriminant for option");
						}
						let variant72;
						switch (dataView(memory0).getUint8(base + 48, true)) {
							case 0:
								variant72 = void 0;
								break;
							case 1:
								variant72 = dataView(memory0).getInt32(base + 52, true) >>> 0;
								break;
							default: throw new TypeError("invalid variant discriminant for option");
						}
						var ptr73 = dataView(memory0).getUint32(base + 56, true);
						var len73 = dataView(memory0).getUint32(base + 60, true);
						var result73 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr73, len73));
						var len75 = dataView(memory0).getUint32(base + 68, true);
						var base75 = dataView(memory0).getUint32(base + 64, true);
						var result75 = [];
						for (let i = 0; i < len75; i++) {
							const base = base75 + i * 8;
							var ptr74 = dataView(memory0).getUint32(base + 0, true);
							var len74 = dataView(memory0).getUint32(base + 4, true);
							var result74 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr74, len74));
							result75.push(result74);
						}
						var len77 = dataView(memory0).getUint32(base + 76, true);
						var base77 = dataView(memory0).getUint32(base + 72, true);
						var result77 = [];
						for (let i = 0; i < len77; i++) {
							const base = base77 + i * 8;
							var ptr76 = dataView(memory0).getUint32(base + 0, true);
							var len76 = dataView(memory0).getUint32(base + 4, true);
							var result76 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr76, len76));
							result77.push(result76);
						}
						result78.push({
							message: result65,
							severity: enum66,
							file: variant68,
							line: variant69,
							column: variant70,
							start: variant71,
							end: variant72,
							formatted: result73,
							hints: result75,
							trace: result77
						});
					}
					var len85 = dataView(memory0).getUint32(ret + 16, true);
					var base85 = dataView(memory0).getUint32(ret + 12, true);
					var result85 = [];
					for (let i = 0; i < len85; i++) {
						const base = base85 + i * 36;
						let enum79;
						switch (dataView(memory0).getUint8(base + 0, true)) {
							case 0:
								enum79 = "project";
								break;
							case 1:
								enum79 = "package";
								break;
							case 2:
								enum79 = "url";
								break;
							default: throw new TypeError("invalid discriminant specified for FileKind");
						}
						var ptr80 = dataView(memory0).getUint32(base + 4, true);
						var len80 = dataView(memory0).getUint32(base + 8, true);
						var result80 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr80, len80));
						let variant82;
						switch (dataView(memory0).getUint8(base + 12, true)) {
							case 0:
								variant82 = void 0;
								break;
							case 1:
								var ptr81 = dataView(memory0).getUint32(base + 16, true);
								var len81 = dataView(memory0).getUint32(base + 20, true);
								variant82 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr81, len81));
								break;
							default: throw new TypeError("invalid variant discriminant for option");
						}
						let variant84;
						switch (dataView(memory0).getUint8(base + 24, true)) {
							case 0:
								variant84 = void 0;
								break;
							case 1:
								var ptr83 = dataView(memory0).getUint32(base + 28, true);
								var len83 = dataView(memory0).getUint32(base + 32, true);
								variant84 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr83, len83));
								break;
							default: throw new TypeError("invalid variant discriminant for option");
						}
						result85.push({
							kind: enum79,
							path: result80,
							resolvedPath: variant82,
							mediaType: variant84
						});
					}
					let variant87;
					switch (dataView(memory0).getUint8(ret + 20, true)) {
						case 0:
							variant87 = void 0;
							break;
						case 1:
							var ptr86 = dataView(memory0).getUint32(ret + 24, true);
							var len86 = dataView(memory0).getUint32(ret + 28, true);
							variant87 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr86, len86));
							break;
						default: throw new TypeError("invalid variant discriminant for option");
					}
					variant88 = {
						tag: "err",
						val: {
							diagnostics: result78,
							dependencies: result85,
							message: variant87
						}
					};
					break;
				}
				default: throw new TypeError("invalid variant discriminant for expected");
			}
			_debugLog("[iface=\"typst:engine/api\", function=\"[method]compiler.compile\"][Instruction::Return]", {
				funcName: "[method]compiler.compile",
				paramCount: 1,
				async: false,
				postReturn: true
			});
			const retCopy = variant88;
			task.resolve([retCopy.val]);
			let cstate = getOrCreateAsyncState(0);
			cstate.mayLeave = false;
			postReturn3(ret);
			cstate.mayLeave = true;
			task.exit();
			if (typeof retCopy === "object" && retCopy.tag === "err") throw new ComponentError(retCopy.val);
			return retCopy.val;
		};
		const trampoline0 = rscTableCreateOwn.bind(null, handleTable0);
		function trampoline1(handle) {
			const handleEntry = rscTableRemove(handleTable0, handle);
			if (handleEntry.own) exports0["2"](handleEntry.rep);
		}
		let trampoline2 = _trampoline2.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(null, {
			trampolineIdx: 2,
			componentIdx: 0,
			isAsync: false,
			isManualAsync: _trampoline2.manuallyAsync,
			paramLiftFns: [_liftFlatRecord({
				fieldMetas: [[
					"path",
					_liftFlatStringAny,
					8,
					4
				], [
					"kind",
					_liftFlatEnum({
						caseMetas: [
							[
								"project",
								null,
								1,
								1,
								1
							],
							[
								"package",
								null,
								1,
								1,
								1
							],
							[
								"url",
								null,
								1,
								1,
								1
							]
						],
						variantSize32: 1,
						variantAlign32: 1,
						variantPayloadOffset32: 1,
						variantFlatCount: 1
					}),
					1,
					1
				]],
				size32: 12,
				align32: 4
			})],
			resultLowerFns: [_lowerFlatResult({
				caseMetas: [[
					"ok",
					_lowerFlatRecord({
						fieldMetas: [
							[
								"data",
								_lowerFlatList({
									elemLowerFn: _lowerFlatU8,
									elemSize32: 1,
									elemAlign32: 1
								}),
								8,
								4
							],
							[
								"resolvedPath",
								_lowerFlatOption({
									caseMetas: [[
										"none",
										null,
										0,
										0,
										0
									], [
										"some",
										_lowerFlatStringAny,
										8,
										4,
										2
									]],
									variantSize32: 12,
									variantAlign32: 4,
									variantPayloadOffset32: 4,
									variantFlatCount: 3
								}),
								12,
								4
							],
							[
								"mediaType",
								_lowerFlatOption({
									caseMetas: [[
										"none",
										null,
										0,
										0,
										0
									], [
										"some",
										_lowerFlatStringAny,
										8,
										4,
										2
									]],
									variantSize32: 12,
									variantAlign32: 4,
									variantPayloadOffset32: 4,
									variantFlatCount: 3
								}),
								12,
								4
							]
						],
						size32: 32,
						align32: 4
					}),
					36,
					4,
					4
				], [
					"err",
					_lowerFlatVariant({
						caseMetas: [
							[
								"not-found",
								null,
								0,
								0,
								0
							],
							[
								"denied",
								null,
								0,
								0,
								0
							],
							[
								"timeout",
								null,
								0,
								0,
								0
							],
							[
								"unavailable",
								null,
								0,
								0,
								0
							],
							[
								"other",
								_lowerFlatStringAny,
								8,
								4,
								2
							]
						],
						variantSize32: 12,
						variantAlign32: 4,
						variantPayloadOffset32: 4,
						variantFlatCount: 3
					}),
					36,
					4,
					4
				]],
				variantSize32: 36,
				variantAlign32: 4,
				variantPayloadOffset32: 4,
				variantFlatCount: 9
			})],
			hasResultPointer: true,
			funcTypeIsAsync: false,
			getCallbackFn: () => null,
			getPostReturnFn: () => null,
			isCancellable: false,
			memoryIdx: 0,
			stringEncoding: "utf8",
			getMemoryFn: () => memory0,
			getReallocFn: () => realloc0,
			importFn: _trampoline2
		})) : _lowerImportBackwardsCompat.bind(null, {
			trampolineIdx: 2,
			componentIdx: 0,
			isAsync: false,
			isManualAsync: _trampoline2.manuallyAsync,
			paramLiftFns: [_liftFlatRecord({
				fieldMetas: [[
					"path",
					_liftFlatStringAny,
					8,
					4
				], [
					"kind",
					_liftFlatEnum({
						caseMetas: [
							[
								"project",
								null,
								1,
								1,
								1
							],
							[
								"package",
								null,
								1,
								1,
								1
							],
							[
								"url",
								null,
								1,
								1,
								1
							]
						],
						variantSize32: 1,
						variantAlign32: 1,
						variantPayloadOffset32: 1,
						variantFlatCount: 1
					}),
					1,
					1
				]],
				size32: 12,
				align32: 4
			})],
			resultLowerFns: [_lowerFlatResult({
				caseMetas: [[
					"ok",
					_lowerFlatRecord({
						fieldMetas: [
							[
								"data",
								_lowerFlatList({
									elemLowerFn: _lowerFlatU8,
									elemSize32: 1,
									elemAlign32: 1
								}),
								8,
								4
							],
							[
								"resolvedPath",
								_lowerFlatOption({
									caseMetas: [[
										"none",
										null,
										0,
										0,
										0
									], [
										"some",
										_lowerFlatStringAny,
										8,
										4,
										2
									]],
									variantSize32: 12,
									variantAlign32: 4,
									variantPayloadOffset32: 4,
									variantFlatCount: 3
								}),
								12,
								4
							],
							[
								"mediaType",
								_lowerFlatOption({
									caseMetas: [[
										"none",
										null,
										0,
										0,
										0
									], [
										"some",
										_lowerFlatStringAny,
										8,
										4,
										2
									]],
									variantSize32: 12,
									variantAlign32: 4,
									variantPayloadOffset32: 4,
									variantFlatCount: 3
								}),
								12,
								4
							]
						],
						size32: 32,
						align32: 4
					}),
					36,
					4,
					4
				], [
					"err",
					_lowerFlatVariant({
						caseMetas: [
							[
								"not-found",
								null,
								0,
								0,
								0
							],
							[
								"denied",
								null,
								0,
								0,
								0
							],
							[
								"timeout",
								null,
								0,
								0,
								0
							],
							[
								"unavailable",
								null,
								0,
								0,
								0
							],
							[
								"other",
								_lowerFlatStringAny,
								8,
								4,
								2
							]
						],
						variantSize32: 12,
						variantAlign32: 4,
						variantPayloadOffset32: 4,
						variantFlatCount: 3
					}),
					36,
					4,
					4
				]],
				variantSize32: 36,
				variantAlign32: 4,
				variantPayloadOffset32: 4,
				variantFlatCount: 9
			})],
			hasResultPointer: true,
			funcTypeIsAsync: false,
			getCallbackFn: () => null,
			getPostReturnFn: () => null,
			isCancellable: false,
			memoryIdx: 0,
			stringEncoding: "utf8",
			getMemoryFn: () => memory0,
			getReallocFn: () => realloc0,
			importFn: _trampoline2
		});
		let trampoline3 = _trampoline3.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(null, {
			trampolineIdx: 3,
			componentIdx: 0,
			isAsync: false,
			isManualAsync: _trampoline3.manuallyAsync,
			paramLiftFns: [_liftFlatOption({
				caseMetas: [[
					"none",
					null,
					0,
					0,
					0
				], [
					"some",
					_liftFlatS64,
					8,
					8,
					1
				]],
				variantSize32: 16,
				variantAlign32: 8,
				variantPayloadOffset32: 8,
				variantFlatCount: 2
			})],
			resultLowerFns: [_lowerFlatOption({
				caseMetas: [[
					"none",
					null,
					0,
					0,
					0
				], [
					"some",
					_lowerFlatRecord({
						fieldMetas: [
							[
								"year",
								_lowerFlatU32,
								4,
								4
							],
							[
								"month",
								_lowerFlatU8,
								1,
								1
							],
							[
								"day",
								_lowerFlatU8,
								1,
								1
							]
						],
						size32: 8,
						align32: 4
					}),
					8,
					4,
					3
				]],
				variantSize32: 12,
				variantAlign32: 4,
				variantPayloadOffset32: 4,
				variantFlatCount: 4
			})],
			hasResultPointer: true,
			funcTypeIsAsync: false,
			getCallbackFn: () => null,
			getPostReturnFn: () => null,
			isCancellable: false,
			memoryIdx: 0,
			stringEncoding: "utf8",
			getMemoryFn: () => memory0,
			getReallocFn: void 0,
			importFn: _trampoline3
		})) : _lowerImportBackwardsCompat.bind(null, {
			trampolineIdx: 3,
			componentIdx: 0,
			isAsync: false,
			isManualAsync: _trampoline3.manuallyAsync,
			paramLiftFns: [_liftFlatOption({
				caseMetas: [[
					"none",
					null,
					0,
					0,
					0
				], [
					"some",
					_liftFlatS64,
					8,
					8,
					1
				]],
				variantSize32: 16,
				variantAlign32: 8,
				variantPayloadOffset32: 8,
				variantFlatCount: 2
			})],
			resultLowerFns: [_lowerFlatOption({
				caseMetas: [[
					"none",
					null,
					0,
					0,
					0
				], [
					"some",
					_lowerFlatRecord({
						fieldMetas: [
							[
								"year",
								_lowerFlatU32,
								4,
								4
							],
							[
								"month",
								_lowerFlatU8,
								1,
								1
							],
							[
								"day",
								_lowerFlatU8,
								1,
								1
							]
						],
						size32: 8,
						align32: 4
					}),
					8,
					4,
					3
				]],
				variantSize32: 12,
				variantAlign32: 4,
				variantPayloadOffset32: 4,
				variantFlatCount: 4
			})],
			hasResultPointer: true,
			funcTypeIsAsync: false,
			getCallbackFn: () => null,
			getPostReturnFn: () => null,
			isCancellable: false,
			memoryIdx: 0,
			stringEncoding: "utf8",
			getMemoryFn: () => memory0,
			getReallocFn: void 0,
			importFn: _trampoline3
		});
		Promise.all([
			module0,
			module1,
			module2
		]).catch(() => {});
		({exports: exports0} = yield instantiateCore(yield module1));
		({exports: exports1} = yield instantiateCore(yield module0, {
			"[export]typst:engine/api": {
				"[resource-drop]compiler": trampoline1,
				"[resource-new]compiler": trampoline0
			},
			"typst:engine/host": {
				fetch: exports0["0"],
				today: exports0["1"]
			}
		}));
		memory0 = exports1.memory;
		realloc0 = exports1.cabi_realloc;
		try {
			WebAssembly.promising(exports1.cabi_realloc);
		} catch (err) {
			exports1.cabi_realloc;
		}
		({exports: exports2} = yield instantiateCore(yield module2, { "": {
			$imports: exports0.$imports,
			"0": trampoline2,
			"1": trampoline3,
			"2": exports1["typst:engine/api#[dtor]compiler"]
		} }));
		postReturn0 = exports1["cabi_post_typst:engine/api#[method]compiler.add-font"];
		try {
			WebAssembly.promising(exports1["cabi_post_typst:engine/api#[method]compiler.add-font"]);
		} catch (err) {
			exports1["cabi_post_typst:engine/api#[method]compiler.add-font"];
		}
		postReturn1 = exports1["cabi_post_typst:engine/api#[method]compiler.add-file"];
		try {
			WebAssembly.promising(exports1["cabi_post_typst:engine/api#[method]compiler.add-file"]);
		} catch (err) {
			exports1["cabi_post_typst:engine/api#[method]compiler.add-file"];
		}
		postReturn2 = exports1["cabi_post_typst:engine/api#[method]compiler.list-files"];
		try {
			WebAssembly.promising(exports1["cabi_post_typst:engine/api#[method]compiler.list-files"]);
		} catch (err) {
			exports1["cabi_post_typst:engine/api#[method]compiler.list-files"];
		}
		postReturn3 = exports1["cabi_post_typst:engine/api#[method]compiler.compile"];
		try {
			WebAssembly.promising(exports1["cabi_post_typst:engine/api#[method]compiler.compile"]);
		} catch (err) {
			exports1["cabi_post_typst:engine/api#[method]compiler.compile"];
		}
		apiConstructorCompiler = exports1["typst:engine/api#[constructor]compiler"];
		apiMethodCompilerAddFont = exports1["typst:engine/api#[method]compiler.add-font"];
		apiMethodCompilerAddFile = exports1["typst:engine/api#[method]compiler.add-file"];
		apiMethodCompilerAddSource = exports1["typst:engine/api#[method]compiler.add-source"];
		apiMethodCompilerSetMain = exports1["typst:engine/api#[method]compiler.set-main"];
		apiMethodCompilerRemoveFile = exports1["typst:engine/api#[method]compiler.remove-file"];
		apiMethodCompilerClearFiles = exports1["typst:engine/api#[method]compiler.clear-files"];
		apiMethodCompilerListFiles = exports1["typst:engine/api#[method]compiler.list-files"];
		apiMethodCompilerHasFile = exports1["typst:engine/api#[method]compiler.has-file"];
		apiMethodCompilerCompile = exports1["typst:engine/api#[method]compiler.compile"];
		const api = { Compiler };
		return {
			api,
			"typst:engine/api": api
		};
	})();
	let promise, resolve, reject;
	function runNext(value) {
		try {
			let done;
			do
				({value, done} = gen.next(value));
			while (!(value instanceof Promise) && !done);
			if (done) if (resolve) return resolve(value);
			else return value;
			if (!promise) promise = new Promise((_resolve, _reject) => (resolve = _resolve, reject = _reject));
			value.then((nextVal) => done ? resolve() : runNext(nextVal), reject);
		} catch (e) {
			if (reject) reject(e);
			else throw e;
		}
	}
	const maybeSyncReturn = runNext(null);
	return promise || maybeSyncReturn;
}

//#endregion
//#region src/worker/protocol.ts
const MiB = 1024 * 1024;
const INITIAL_SAB_SIZE = 1 * MiB;
const MAX_SAB_SIZE = 256 * MiB;
const DEFAULT_FETCH_TIMEOUT = 3e4;
const SharedMemoryCommunicationStatus = {
	None: 0,
	Pending: 1,
	Error: 2,
	Success: 3
};
const SharedMemoryCommunicationError = {
	Other: 0,
	NotFound: 1,
	Denied: 2,
	Timeout: 3,
	Unavailable: 4
};
var SharedMemoryCommunication = class SharedMemoryCommunication {
	dataBuf;
	statusBuf;
	sizeBuf;
	errorBuf;
	constructor() {
		this.dataBuf = new SharedArrayBuffer(INITIAL_SAB_SIZE, { maxByteLength: MAX_SAB_SIZE });
		this.statusBuf = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
		this.sizeBuf = new SharedArrayBuffer(Uint32Array.BYTES_PER_ELEMENT);
		this.errorBuf = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
	}
	getStatusView() {
		return new Int32Array(this.statusBuf);
	}
	getSizeView() {
		return new Uint32Array(this.sizeBuf);
	}
	getStatus() {
		return Atomics.load(this.getStatusView(), 0);
	}
	setStatus(status) {
		const statusView = this.getStatusView();
		Atomics.store(statusView, 0, status);
		Atomics.notify(statusView, 0, 1);
	}
	setBuffer(buf) {
		const needed = buf.byteLength;
		if (needed > MAX_SAB_SIZE) throw new RangeError(`File too large: ${needed} bytes. Maximum allowed: ${MAX_SAB_SIZE} bytes.`);
		if (needed > this.dataBuf.byteLength) try {
			this.dataBuf.grow(needed);
		} catch (cause) {
			throw new Error(`Unable to grow the shared buffer from ${this.dataBuf.byteLength} bytes to ${needed} bytes.`, { cause });
		}
		new Uint8Array(this.dataBuf, 0, needed).set(buf);
		Atomics.store(this.getSizeView(), 0, needed);
	}
	getBuffer() {
		const size = Atomics.load(this.getSizeView(), 0);
		if (size > this.dataBuf.byteLength) throw new Error(`Invalid shared buffer size: ${size}. Current buffer length: ${this.dataBuf.byteLength}.`);
		return new Uint8Array(this.dataBuf, 0, size);
	}
	setError(error) {
		Atomics.store(new Int32Array(this.errorBuf), 0, error);
	}
	getError() {
		return Atomics.load(new Int32Array(this.errorBuf), 0);
	}
	waitForStatusChange(expectedStatus, timeoutMs = DEFAULT_FETCH_TIMEOUT) {
		const statusView = this.getStatusView();
		const deadline = Date.now() + timeoutMs;
		while (Atomics.load(statusView, 0) === expectedStatus) {
			const remaining = deadline - Date.now();
			if (remaining <= 0) return false;
			if (Atomics.wait(statusView, 0, expectedStatus, remaining) === "timed-out" && Atomics.load(statusView, 0) === expectedStatus) return false;
		}
		return true;
	}
	static hydrateObj(obj) {
		const instance = Object.create(SharedMemoryCommunication.prototype);
		instance.dataBuf = obj.dataBuf;
		instance.statusBuf = obj.statusBuf;
		instance.sizeBuf = obj.sizeBuf;
		instance.errorBuf = obj.errorBuf;
		return instance;
	}
};

//#endregion
//#region src/worker/messages.ts
const commandKinds = [
	"init",
	"add_file",
	"add_source",
	"add_fonts",
	"remove_file",
	"clear_files",
	"set_main",
	"compile",
	"list_files",
	"has_file"
];
const payloadCommands = new Set([
	"init",
	"add_file",
	"add_source",
	"add_fonts",
	"remove_file",
	"set_main",
	"compile",
	"has_file"
]);
const isRecord = (value) => typeof value === "object" && value !== null;
const isCommandKind = (value) => typeof value === "string" && commandKinds.includes(value);
const isMainToWorkerMessage = (value) => {
	if (!isRecord(value)) return false;
	if (!isCommandKind(value.kind) || typeof value.requestId !== "number") return false;
	const hasPayload = "payload" in value;
	if (payloadCommands.has(value.kind)) return hasPayload && isRecord(value.payload);
	return !hasPayload;
};

//#endregion
//#region src/worker/runtime.ts
const extractErrorPayload = (error) => {
	if (typeof error !== "object" || error === null) return void 0;
	if ("payload" in error) return error.payload;
	if ("cause" in error) return extractErrorPayload(error.cause);
};
const serializeErrorCause = (cause) => {
	const payload = extractErrorPayload(cause);
	return payload === void 0 ? cause : { payload };
};
var WorkerCommandError = class extends Error {
	constructor(requestId, code, message, cause) {
		super(message);
		this.requestId = requestId;
		this.code = code;
		this.cause = cause;
		this.name = "WorkerCommandError";
	}
};
const toWorkerCommandError = (error, requestId) => error instanceof WorkerCommandError ? error : new WorkerCommandError(requestId, "COMMAND_FAILED", "Unhandled worker command failure", error);
const fetchErrorForCode = (code) => {
	switch (code) {
		case SharedMemoryCommunicationError.NotFound: throw { tag: "not-found" };
		case SharedMemoryCommunicationError.Denied: throw { tag: "denied" };
		case SharedMemoryCommunicationError.Timeout: throw { tag: "timeout" };
		case SharedMemoryCommunicationError.Unavailable: throw { tag: "unavailable" };
		default: throw {
			tag: "other",
			val: "Worker fetch failed"
		};
	}
};
const installTypstWorkerRuntime = (port, loadEngine) => {
	let compiler = null;
	let sharedMemoryCommunication = null;
	const hostFetch = (request) => {
		if (!sharedMemoryCommunication) throw new Error("Communication buffer not initialized");
		for (let attempt = 0; attempt < 3; attempt += 1) {
			sharedMemoryCommunication.setStatus(SharedMemoryCommunicationStatus.Pending);
			port.postMessage({
				kind: "web_fetch",
				payload: { request }
			});
			if (!sharedMemoryCommunication.waitForStatusChange(SharedMemoryCommunicationStatus.Pending, 3e4)) continue;
			if (sharedMemoryCommunication.getStatus() === SharedMemoryCommunicationStatus.Success) return { data: new Uint8Array(sharedMemoryCommunication.getBuffer()) };
			if (sharedMemoryCommunication.getStatus() === SharedMemoryCommunicationStatus.Error) fetchErrorForCode(sharedMemoryCommunication.getError());
		}
		throw { tag: "timeout" };
	};
	const successResponse = (requestId, result) => ({
		requestId,
		result
	});
	const errorResponse = (requestId, code, message, cause) => ({
		requestId,
		error: {
			code,
			message,
			cause
		}
	});
	const ensureCompiler = (requestId) => {
		if (compiler) return compiler;
		throw new WorkerCommandError(requestId, "COMPILER_NOT_INITIALIZED", "Compiler not initialized");
	};
	const runCompilerCommand = (requestId, commandName, run) => {
		const readyCompiler = ensureCompiler(requestId);
		try {
			return run(readyCompiler);
		} catch (cause) {
			throw new WorkerCommandError(requestId, "COMMAND_FAILED", `Worker command failed: ${commandName}`, cause);
		}
	};
	const handleRequest = async (request) => {
		switch (request.kind) {
			case "init":
				sharedMemoryCommunication = SharedMemoryCommunication.hydrateObj(request.payload.sharedMemoryCommunication);
				try {
					const engine = await loadEngine();
					const coreModules = request.payload.coreModules;
					if (!coreModules) throw new Error("Worker requires engine core modules");
					compiler = new (await (engine.instantiate((name) => {
						const module = coreModules[name];
						if (!module) throw new Error(`Unknown core module: ${name}`);
						return module;
					}, { "typst:engine/host": {
						fetch: hostFetch,
						today: () => void 0
					} }))).api.Compiler();
				} catch (cause) {
					throw new WorkerCommandError(request.requestId, "INIT_FAILED", "Failed to initialize WASM worker", cause);
				}
				return successResponse(request.requestId, void 0);
			case "add_file":
				runCompilerCommand(request.requestId, "add-file", (readyCompiler) => {
					readyCompiler.addFile(request.payload.path, request.payload.data);
				});
				return successResponse(request.requestId, void 0);
			case "add_source":
				runCompilerCommand(request.requestId, "add-source", (readyCompiler) => {
					readyCompiler.addSource(request.payload.path, request.payload.text);
				});
				return successResponse(request.requestId, void 0);
			case "add_fonts":
				runCompilerCommand(request.requestId, "add-fonts", (readyCompiler) => {
					for (const font of request.payload.data) readyCompiler.addFont(font);
				});
				return successResponse(request.requestId, void 0);
			case "remove_file":
				runCompilerCommand(request.requestId, "remove-file", (readyCompiler) => {
					readyCompiler.removeFile(request.payload.path);
				});
				return successResponse(request.requestId, void 0);
			case "clear_files":
				runCompilerCommand(request.requestId, "clear-files", (readyCompiler) => {
					readyCompiler.clearFiles();
				});
				return successResponse(request.requestId, void 0);
			case "set_main":
				runCompilerCommand(request.requestId, "set-main", (readyCompiler) => {
					readyCompiler.setMain(request.payload.path);
				});
				return successResponse(request.requestId, void 0);
			case "compile": return successResponse(request.requestId, await runCompilerCommand(request.requestId, "compile", (readyCompiler) => readyCompiler.compile(request.payload.options)));
			case "list_files": return successResponse(request.requestId, runCompilerCommand(request.requestId, "list-files", (readyCompiler) => readyCompiler.listFiles()));
			case "has_file": return successResponse(request.requestId, runCompilerCommand(request.requestId, "has-file", (readyCompiler) => readyCompiler.hasFile(request.payload.path)));
		}
	};
	port.onMessage((data) => {
		if (!isMainToWorkerMessage(data)) return;
		handleRequest(data).catch((error) => {
			const commandError = toWorkerCommandError(error, data.requestId);
			return errorResponse(commandError.requestId, commandError.code, commandError.message, serializeErrorCause(commandError.cause));
		}).then((result) => {
			if (result) port.postMessage(result);
		});
	});
};

//#endregion
//#region src/worker/web-worker.ts
const scope = globalThis;
installTypstWorkerRuntime({
	onMessage: (handler) => {
		scope.onmessage = (event) => handler(event.data);
	},
	postMessage: (data) => scope.postMessage(data)
}, async () => engine_exports);

//#endregion
//# sourceMappingURL=web-worker.js.map