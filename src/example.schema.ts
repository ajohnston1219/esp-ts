export interface AddEvent {
    _tag: 'AddEvent';
    /**
     * @minimum 0
     * @maximum 100
     */
    amount: number;
}