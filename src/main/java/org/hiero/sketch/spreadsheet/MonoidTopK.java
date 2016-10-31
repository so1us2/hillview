package org.hiero.sketch.spreadsheet;

import org.hiero.sketch.dataset.api.IMonoid;
import java.util.Comparator;
import java.util.Iterator;
import java.util.SortedMap;
import java.util.TreeMap;

/**
 * This monoid is a sorted list of T objects, up to size K.
 * @param <T> Type of items in sorted list.
 */
public class MonoidTopK<T> implements IMonoid<SortedMap<T, Integer>> {
    private int maxSize;
    private Comparator<T> greater;

    /**
     * Create a TopK monoid.
     * @param maxSize: this is K, the size of the list
     * @param greater: this is the comparison operator for deciding the top K
     */
    public MonoidTopK(int maxSize, Comparator<T> greater) {
        this.maxSize = maxSize;
        this.greater = greater;
    }

    /**
     * Zero is the empty list.
     */
    @Override
    public SortedMap<T, Integer> zero() {
        return new TreeMap<T, Integer>(this.greater);
    }

    /**
     * Addition is merge sort.
     */
    @Override
    public SortedMap<T, Integer> add(SortedMap<T, Integer> left, SortedMap<T, Integer> right) {
        Iterator<T> itLeft = left.keySet().iterator();
        Iterator<T> itRight = right.keySet().iterator();
        T leftKey = (itLeft.hasNext())? itLeft.next(): null;
        T rightKey = (itRight.hasNext())? itRight.next(): null;
        TreeMap<T, Integer> mergedMap = new TreeMap<T, Integer>(this.greater);

        while((mergedMap.size() < maxSize) && ((leftKey != null)||(rightKey != null))) {
            if (leftKey == null) {
                mergedMap.put(rightKey, right.get(rightKey));
                rightKey = (itRight.hasNext()) ? itRight.next() : null;
            } else if (rightKey == null) {
                mergedMap.put(leftKey, left.get(leftKey));
                leftKey = (itLeft.hasNext()) ? itLeft.next() : null;
            } else {
                if (greater.compare(leftKey, rightKey) == 1) {
                    mergedMap.put(rightKey, right.get(rightKey));
                    rightKey = (itRight.hasNext()) ? itRight.next() : null;
                } else if (greater.compare(leftKey, rightKey) == -1) {
                    mergedMap.put(leftKey, left.get(leftKey));
                    leftKey = (itLeft.hasNext()) ? itLeft.next() : null;
                } else { //Keys are equal
                    mergedMap.put(leftKey, left.get(leftKey) + right.get(rightKey));
                    leftKey = (itLeft.hasNext()) ? itLeft.next() : null;
                    rightKey = (itRight.hasNext()) ? itRight.next() : null;
                }
            }
        }
        return mergedMap;
    }
}