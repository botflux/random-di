export class HttpService {}

export class DbConnection {
    public _isConnected: boolean = true

    isConnected(): boolean {
        return this._isConnected
    }

    connect(): void {
        this._isConnected = true
    }

    disconnect(): void {
        this._isConnected = false
    }
}

export class UserRepository {
    constructor(
        public readonly dbConnection: DbConnection
    ) {}
}

export class Configuration {
    constructor(
       public readonly connectionUri: string,
    ) {}
}

export class ConfigurationLoader {
    constructor(public readonly fileLocation: string) {}

    load(): Configuration {
        return new Configuration('uri://to-db')
    }

    async loadAsync(): Promise<Configuration> {
        return this.load()
    }
}

export class DatabaseConnection {
    constructor(public readonly configuration: Configuration) {}
}

export class ArticleRepository {
    constructor(public readonly dbConnection: DatabaseConnection) {}
}
