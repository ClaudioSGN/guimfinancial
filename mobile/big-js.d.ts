declare module 'big.js' {
  export type BigSource = Big | number | string;

  export default class Big {
    constructor(value: BigSource);

    static roundDown: number;

    c?: number[];

    div(value: BigSource): Big;
    gt(value: BigSource): boolean;
    lte(value: BigSource): boolean;
    plus(value: BigSource): Big;
    round(dp?: number, rm?: number): Big;
    times(value: BigSource): Big;
    toString(): string;
  }
}
