class ErrorResultMappingError extends Error {
    constructor(public readonly error: unknown) {
        super(`Something went wrong while mapping a error result.`)
    }
}

class OkResult<Value, Err extends Error> {
    public readonly isOk: boolean = true
    public readonly isError: boolean = false

    constructor(private readonly value: Value) {}

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

class ErrorResult<Value, Err extends Error> {
    public readonly isOk: boolean = false
    public readonly isError: boolean = true

    constructor(private readonly error: Err) {}

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

type Result<Value, Err extends Error> = OkResult<Value, Err> | ErrorResult<Value, Err>

const Ok = <Value> (value: Value): Result<Value, Error> => new OkResult<Value, Error>(value)
const Err = <Err extends Error> (error: Err): Result<any, Err> => new ErrorResult<any, Err>(error)

describe('Ok result', function () {
    it('should encapsulate a value into a Ok result', function () {
        // Arrange
        const value = 12

        // Act
        const result = Ok(value)

        // Assert
        expect(result.unwrap()).toBe(12)
        expect(result.isOk).toBe(true)
        expect(result.isError).toBe(false)
    })

    it('should encapsulate an error into a Error result', function () {
        // Arrange
        const error = new Error('hello world')

        // Act
        const result = Err(error)

        // Assert
        expect(result.unwrapError()).toEqual(new Error('hello world'))
        expect(result.isOk).toBe(false)
        expect(result.isError).toBe(true)
    })

    it('should map a ok result to another ok result', function () {
        // Arrange
        const value = 23

        // Act
        const result = Ok(value)
            .map(v => v * 2)

        // Assert
        expect(result.unwrap()).toBe(46)
        expect(result.isOk).toBe(true)
        expect(result.isError).toBe(false)
    })

    it('should map a error result to another error result', function () {
        // Arrange
        const error = new Error('hello world')

        // Act
        const result = Err(error)
            .mapError(error => new TypeError('type error'))

        // Assert
        expect(result.unwrapError()).toEqual(new TypeError('type error'))
        expect(result.isOk).toBe(false)
        expect(result.isError).toBe(true)
    })

    it('should map a ok result to an error result if the mapping function throws an error', function () {
        // Arrange
        const value = 23

        // Act
        const result = Ok(value)
            .map(v => {
                throw new Error('hello world')
            })

        // Assert
        expect(result.unwrapError()).toEqual(new Error('hello world'))
        expect(result.isOk).toBe(false)
        expect(result.isError).toBe(true)
    })
})

class SomeOption<Value> {
    public readonly isSome: boolean = true
    public readonly isNone: boolean = false

    constructor(private readonly value: Value) {}

    unwrap(): Value {
        return this.value
    }

    toResult(): Result<Value, Error> {
        return Ok(this.value)
    }

    map<NewValue>(func: (value: Value) => NewValue): Option<NewValue> {
        return new SomeOption(func(this.value))
    }

    unwrapOr(defaultValue: Value): Value {
        return this.value
    }
}

class EmptyOptionError extends Error {
    constructor() {
        super("Can't unwrap an empty option");
    }
}

class NoneOption<Value> {
    public readonly isSome: boolean = false
    public readonly isNone: boolean = true

    unwrap(): Value {
        throw new EmptyOptionError()
    }

    toResult(): Result<Value, Error> {
        return Err(new EmptyOptionError())
    }

    map<NewValue> (func: (value: Value) => NewValue): Option<NewValue> {
        return this as unknown as Option<NewValue>
    }

    unwrapOr(defaultValue: Value): Value {
        return defaultValue
    }
}

type Option<Value> = SomeOption<Value> | NoneOption<Value>

const Some = <Value> (value: Value): Option<Value> => new SomeOption(value)
const None: Option<any> = new NoneOption()

describe('option type', () => {
    it('should encapsulate a non-nullable value', function () {
        // Arrange
        const value = 2

        // Act
        const optionalValue = Some(value)

        // Assert
        expect(optionalValue.unwrap()).toBe(2)
        expect(optionalValue.isSome).toBe(true)
        expect(optionalValue.isNone).toBe(false)
    })

    it('should throw when unwrapping a empty option', function () {
        // Arrange
        const option = None

        // Act
        const throws = () => option.unwrap()

        // Assert
        expect(throws).toThrow(Error)
        expect(option.isSome).toBe(false)
        expect(option.isNone).toBe(true)
    })

    it('should map value of a non-null option', function () {
        // Arrange
        const value = 'hello'

        // Act
        const optionalValue = Some(value)
            .map(value => value.toUpperCase())

        // Assert
        expect(optionalValue.unwrap()).toBe('HELLO')
    })

    it('should not map empty option', function () {
        // Arrange
        const option: Option<string> = None

        // Act
        const newOption = option.map(value => value.toUpperCase())

        // Assert
        expect(newOption.isNone).toBe(true)
        expect(newOption.isSome).toBe(false)
    })

    it('should throw when unwrapping an empty option', function () {
        // Arrange

        // Act
        const throws = () => None.unwrap()

        // Assert
        expect(throws).toThrow(EmptyOptionError)
    })

    it('should unwrap empty option to a error result', function () {
        // Arrange
        const option = None

        // Act
        const result = option.toResult()

        // Assert
        expect(result.isError).toBe(true)
        expect(result.isOk).toBe(false)
        expect(result.unwrapError()).toBeInstanceOf(EmptyOptionError)
    })

    it('should unwrap non-null value to a ok result', function () {
        // Arrange
        const option = Some('hello world')

        // Act
        const result = option.toResult()

        // Assert
        expect(result.isOk).toBe(true)
        expect(result.isError).toBe(false)
        expect(result.unwrap()).toBe('hello world')
    })

    it('should not fallback on a default value if the option is not empty', function () {
        // Arrange
        const option = Some(false)

        // Act
        const value = option.unwrapOr(true)

        // Assert
        expect(value).toBe(false)
    })

    it('should fallback on a default value if the option is empty', function () {
        // Arrange

        // Act
        const value = None.unwrapOr(true)

        // Assert
        expect(value).toBe(true)
    })
})
