/**
 * The representation of a vertex in the graph.
 * @see DirectedAcyclicGraph
 */
export type Vertex<Key, Value> = {
    key: Key,
    value: Value
    neighbours: Key[]
}

/**
 * A visit vertex function type.
 * @see DirectedAcyclicGraph.traverse
 */
export type VisitVertex<Key, Value> = (vertex: Vertex<Key, Value>) => void

/**
 * Thrown when there is no vertex matching the given key.
 * @see DirectedAcyclicGraph.getVertex
 * @see DirectedAcyclicGraph.getVertexStrict
 */
export class NoVertexError<Key> extends Error {
    constructor(public readonly key: Key) {
        super(`There is no vertex matching key "${key}".`)
    }
}

/**
 * Thrown when the given neighbours doesn't exist.
 * @see DirectedAcyclicGraph.addVertex
 */
export class NoNeighbourError<Key> extends Error {
    constructor(
        public readonly parent: Key,
        public readonly neighbour: Key
    ) {
        super(`Can't add the vertex with key ${parent} since the neighbour with key ${neighbour} doesn't exist.`)
    }
}

/**
 * A simple directed acyclic graph implementation.
 * This structure is used for storing services and their dependencies.
 */
export class DirectedAcyclicGraph<Key, Value> {
    private vertices: Vertex<Key, Value>[] = []

    /**
     * Add a new vertex into the graph.
     * This method throws if the given neighbours are not in the graph.
     *
     * @param key
     * @param value
     * @param neighbours
     */
    addVertex(key: Key, value: Value, neighbours: Key[] = []): DirectedAcyclicGraph<Key, Value> {
        for (const neighbour of neighbours) {
            if (!this.isVertexExisting(neighbour)) {
                throw new NoNeighbourError(key, neighbour)
            }
        }

        this.vertices = [
            ...this.vertices,
            {key, value, neighbours}
        ]

        return this
    }

    /**
     * Return true if there is an existing vertex for the given key.
     *
     * @param key
     */
    isVertexExisting(key: Key): boolean {
        return !!this.getVertex(key)
    }

    /**
     * Return a vertex from its key.
     * If there is no vertex matching the given key then `undefined` is returned.
     *
     * @param key
     */
    getVertex(key: Key): Vertex<Key, Value> | undefined {
        return this.vertices.find(vertex =>
            vertex.key === key)
    }

    /**
     * A stricter version a `getVertex`.
     * This method throws when there is no vertex found.
     *
     * @param key
     */
    getVertexStrict(key: Key): Vertex<Key, Value> {
        const vertex = this.getVertex(key)

        if (!vertex)
            throw new NoVertexError(key)

        return vertex
    }

    /**
     * Return true if two vertices are connected.
     *
     * @param key1
     * @param key2
     */
    areConnected(key1: Key, key2: Key): boolean {
        const vertex = this.getVertexStrict(key1)

        return !!vertex.neighbours.find(key => key === key2)
    }

    /**
     * Traverse the graph.
     *
     * @param key
     * @param visit
     */
    traverse(key: Key, visit: VisitVertex<Key, Value>): void {
        const vertex = this.getVertexStrict(key)

        visit(vertex)

        vertex.neighbours
            .forEach(key => this.traverse(key, visit))
    }
}
