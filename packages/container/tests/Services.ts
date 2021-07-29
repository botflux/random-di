export class HttpService {}

export class DbConnection {
    public _isConnected: boolean = true

    isConnected(): boolean {
        return this._isConnected
    }

    connect(): void {
        this._isConnected = true
    }
}
