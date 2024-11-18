interface mxUtils {
    /**
     * Creates a new function that, when called, has its `this` keyword set to the provided value,
     * with a given sequence of arguments preceding any provided when the new function is called.
     * @param context The object to be used as the `this` object.
     * @param fn The function to bind.
     * @param args Additional arguments to be passed to the new function.
     */
    bind<T, A extends any[], R>(
        context: T,
        fn: (this: T, ...args: A) => R,
    ): (...args: A) => R;
}

interface mxResources {
    get(key: string): string
}

interface Drawio extends Window {
    mxUtils: mxUtils
    mxResources: any
    LocalFile: any
    Editor: any
    Action: any
    Menus: any
    Menu: any
    App: any
}