import { DEFAULT_AGENT_URL } from "../lib/constants";
import { AgentEvents } from "../lib/enums/AgentEvents";
import { AbstractLiveClient } from "./AbstractLiveClient";
export class AgentLiveClient extends AbstractLiveClient {
    constructor(options, endpoint = "/:version/agent/converse") {
        var _a, _b, _c, _d;
        super(options);
        this.namespace = "agent";
        this.baseUrl = (_d = (_c = (_b = (_a = options.agent) === null || _a === void 0 ? void 0 : _a.websocket) === null || _b === void 0 ? void 0 : _b.options) === null || _c === void 0 ? void 0 : _c.url) !== null && _d !== void 0 ? _d : DEFAULT_AGENT_URL;
        this.connect({}, endpoint);
    }
    /**
     * Sets up the connection event handlers.
     * This method is responsible for handling the various events that can occur on the WebSocket connection, such as opening, closing, and receiving messages.
     * - When the connection is opened, it emits the `AgentEvents.Open` event.
     * - When the connection is closed, it emits the `AgentEvents.Close` event.
     * - When an error occurs on the connection, it emits the `AgentEvents.Error` event.
     * - When a message is received, it parses the message and emits the appropriate event based on the message type.
     */
    setupConnection() {
        // Set up standard connection events (open, close, error) using abstracted method
        this.setupConnectionEvents({
            Open: AgentEvents.Open,
            Close: AgentEvents.Close,
            Error: AgentEvents.Error,
        });
        // Set up message handling specific to agent conversations
        if (this.conn) {
            this.conn.onmessage = (event) => {
                this.handleMessage(event);
            };
        }
    }
    /**
     * Handles incoming messages from the WebSocket connection.
     * @param event - The MessageEvent object representing the received message.
     */
    handleMessage(event) {
        var _a, _b, _c, _d, _e, _f;
        if (typeof event.data === "string") {
            try {
                const data = JSON.parse(event.data);
                this.handleTextMessage(data);
            }
            catch (error) {
                this.emit(AgentEvents.Error, {
                    event,
                    data: ((_a = event.data) === null || _a === void 0 ? void 0 : _a.toString().substring(0, 200)) +
                        (((_b = event.data) === null || _b === void 0 ? void 0 : _b.toString().length) > 200 ? "..." : ""),
                    message: "Unable to parse `data` as JSON.",
                    error,
                    url: (_c = this.conn) === null || _c === void 0 ? void 0 : _c.url,
                    readyState: (_d = this.conn) === null || _d === void 0 ? void 0 : _d.readyState,
                });
            }
        }
        else if (event.data instanceof Blob) {
            event.data.arrayBuffer().then((buffer) => {
                this.handleBinaryMessage(Buffer.from(buffer));
            });
        }
        else if (event.data instanceof ArrayBuffer) {
            this.handleBinaryMessage(Buffer.from(event.data));
        }
        else if (Buffer.isBuffer(event.data)) {
            this.handleBinaryMessage(event.data);
        }
        else {
            console.log("Received unknown data type", event.data);
            this.emit(AgentEvents.Error, {
                event,
                message: "Received unknown data type.",
                url: (_e = this.conn) === null || _e === void 0 ? void 0 : _e.url,
                readyState: (_f = this.conn) === null || _f === void 0 ? void 0 : _f.readyState,
                dataType: typeof event.data,
            });
        }
    }
    /**
     * Handles binary messages received from the WebSocket connection.
     * @param data - The binary data.
     */
    handleBinaryMessage(data) {
        this.emit(AgentEvents.Audio, data);
    }
    /**
     * Handles text messages received from the WebSocket connection.
     * @param data - The parsed JSON data.
     */
    handleTextMessage(data) {
        if (data.type in AgentEvents) {
            this.emit(data.type, data);
        }
        else {
            this.emit(AgentEvents.Unhandled, data);
        }
    }
    /**
     * To be called with your model configuration BEFORE sending
     * any audio data.
     * @param options - The SettingsConfiguration object.
     */
    configure(options) {
        const string = JSON.stringify(Object.assign({ type: "Settings" }, options));
        this.send(string);
    }
    /**
     * Provide new system prompt to the LLM.
     * @param prompt - The system prompt to provide.
     */
    updatePrompt(prompt) {
        this.send(JSON.stringify({ type: "UpdatePrompt", prompt }));
    }
    /**
     * Change the speak model.
     * @param model - The new model to use.
     */
    updateSpeak(speakConfig) {
        this.send(JSON.stringify({ type: "UpdateSpeak", speak: speakConfig }));
    }
    /**
     * Immediately trigger an agent message. If this message
     * is sent while the user is speaking, or while the server is in the
     * middle of sending audio, then the request will be ignored and an InjectionRefused
     * event will be emitted.
     * @example "Hold on while I look that up for you."
     * @example "Are you still on the line?"
     * @param content - The message to speak.
     */
    injectAgentMessage(content) {
        this.send(JSON.stringify({ type: "InjectAgentMessage", content }));
    }
    /**
     * Send a text-based message to the agent as if it came from the user.
     * This allows you to inject user messages into the conversation for the agent to respond to.
     * @example "Hello! Can you hear me?"
     * @example "What's the weather like today?"
     * @param content - The specific phrase or statement the agent should respond to.
     */
    injectUserMessage(content) {
        this.send(JSON.stringify({ type: "InjectUserMessage", content }));
    }
    /**
     * Respond to a function call request.
     * @param response  - The response to the function call request.
     */
    functionCallResponse(response) {
        this.send(JSON.stringify(Object.assign({ type: "FunctionCallResponse" }, response)));
    }
    /**
     * Send a keepalive to avoid closing the websocket while you
     * are not transmitting audio. This should be sent at least
     * every 8 seconds.
     */
    keepAlive() {
        this.send(JSON.stringify({ type: "KeepAlive" }));
    }
}
//# sourceMappingURL=AgentLiveClient.js.map