export class ErrorResultMappingError extends Error {
    constructor(public readonly error: unknown) {
        super(`Something went wrong while mapping a error result.`)
    }
}

export class OkResult<Value, Err extends Error> {
    public readonly isOk: boolean = true
    public readonly isError: boolean = false

    constructor(private readonly value: Value) {
    }

    unwrap(): Value {
        return this.value
    }

    unwrapError(): Err {
        throw new Error('The result is a value. You should use unwrap instead.')
    }

    map<NewValue>(f: (value: Value) => NewValue): Result<NewValue, Err> {
        try {
            return new OkResult<NewValue, Err>(f(this.value))
        } catch (error: unknown) {
            return new ErrorResult<NewValue, Err>(error as Err)
        }
    }

    mapError<NewErr extends Error>(f: (error: Err) => NewErr): Result<Value, NewErr> {
        return this as unknown as Result<Value, NewErr>
    }
}

export class ErrorResult<Value, Err extends Error> {
    public readonly isOk: boolean = false
    public readonly isError: boolean = true

    constructor(private readonly error: Err) {
    }

    unwrapError(): Err {
        return this.error
    }

    unwrap(): Value {
        throw new Error('The result is a error. You should use unwrapError instead.')
    }

    map<NewValue>(f: (value: Value) => NewValue): Result<NewValue, Err> {
        return this as unknown as Result<NewValue, Err>
    }

    mapError<NewErr extends Error>(f: (error: Err) => NewErr): Result<Value, NewErr> {
        try {
            return new ErrorResult(f(this.error))
        } catch (error: unknown) {
            return new ErrorResult(
                new ErrorResultMappingError(error) as unknown as NewErr
            )
        }
    }
}

export type Result<Value, Err extends Error> = OkResult<Value, Err> | ErrorResult<Value, Err>
export const Ok = <Value>(value: Value): Result<Value, Error> => new OkResult<Value, Error>(value)
export const Err = <Err extends Error>(error: Err): Result<any, Err> => new ErrorResult<any, Err>(error)
