class CoffeeWebSocket {
  constructor(url, handlers) {
    this.url = url;
    this.handlers = handlers;
    this.ws = null;
    this._retryDelay = 1000;
    this._maxDelay = 16000;
    this._stopped = false;
    this._connect();
  }

  _connect() {
    if (this._stopped) return;
    this.ws = new WebSocket(this.url);

    this.ws.addEventListener('open', () => {
      this._retryDelay = 1000;
      if (this.handlers.onOpen) this.handlers.onOpen();
    });

    this.ws.addEventListener('message', (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      if (this.handlers.onMessage) this.handlers.onMessage(msg);
    });

    this.ws.addEventListener('close', () => {
      if (this._stopped) return;
      if (this.handlers.onClose) this.handlers.onClose();
      setTimeout(() => this._connect(), this._retryDelay);
      this._retryDelay = Math.min(this._retryDelay * 2, this._maxDelay);
    });

    this.ws.addEventListener('error', () => {
      // close event will fire after error, reconnect handled there
    });
  }

  send(event, data = {}) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ event, ...data }));
    }
  }

  close() {
    this._stopped = true;
    if (this.ws) this.ws.close();
  }
}
