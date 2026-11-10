package com.github.quentili.dupinanalyzer.models;

import java.util.List;

public record ConfigPattern(String name, String pattern, List<String> groups, String color) {
}
