package lk.gov.ciaboc.rvm.common;

import java.util.LinkedHashMap;
import java.util.Map;

/** Builds audit detail maps; unlike Map.of it accepts null values. */
public final class Details {
    private Details() {}

    public static Map<String, Object> of(Object... keyValues) {
        if (keyValues.length % 2 != 0) throw new IllegalArgumentException("key/value pairs expected");
        Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i < keyValues.length; i += 2) m.put(String.valueOf(keyValues[i]), keyValues[i + 1]);
        return m;
    }
}
