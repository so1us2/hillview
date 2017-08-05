/*
 * Copyright (c) 2017 VMWare Inc. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *       http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

export interface Pair<T1, T2> {
    first: T1;
    second: T2;
}

export interface Triple<T1, T2, T3> {
    first: T1;
    second: T2;
    third: T3;
}

// Direct counterpart of corresponding Java class
export class Converters {
    public static dateFromDouble(value: number): Date {
        return new Date(value);
    }

    public static doubleFromDate(value: Date): number {
        return value.getTime();
    }
}

export function reorder(m: number, n: number): [number, number] {
    if (m < n)
        return [m, n];
    else
        return [n, m];
}

// This class builds some useful iterators over typescript enums.
// In all these methods e is an enum *type*
export class EnumIterators {
    static getNamesAndValues<T extends number>(e: any) {
        return EnumIterators.getNames(e).map(n => ({ name: n, value: e[n] as T }));
    }

    static getNames(e: any) {
        return EnumIterators.getObjValues(e).filter(v => typeof v === "string") as string[];
    }

    static getValues<T extends number>(e: any) {
        return EnumIterators.getObjValues(e).filter(v => typeof v === "number") as T[];
    }

    private static getObjValues(e: any): (number | string)[] {
        return Object.keys(e).map(k => e[k]);
    }
}
